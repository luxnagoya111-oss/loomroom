// app/api/admin/webauthn/login/verify/route.ts
import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";

import {
  ADMIN_EMAIL_ALLOWLIST,
  ADMIN_ORIGIN,
  ADMIN_RP_ID,
} from "@/lib/adminConfig";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { consumeChallenge } from "../../_store";
import {
  applyAdminSessionCookie,
  createAdminSession,
} from "@/lib/adminSession";

export const runtime = "nodejs";

const ADMIN_EMAIL = ADMIN_EMAIL_ALLOWLIST[0] || null;

function safeNext(next: string | null) {
  if (!next) return "/admin";
  return next.startsWith("/") ? next : "/admin";
}

/* =========================================================
 * base64url strict decode helper
 * ========================================================= */
function isBase64urlString(s: string): boolean {
  return /^[A-Za-z0-9\-_]*$/.test(s);
}

function base64urlToBufferStrict(s: string): Buffer {
  if (typeof s !== "string") throw new Error("not a string");
  if (!isBase64urlString(s)) throw new Error("contains non-base64url chars");
  if (s.length % 4 === 1) throw new Error("invalid base64url length (mod 4 === 1)");
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, "base64");
}

function validateAssertionBase64url(assertion: any) {
  const problems: Array<{ field: string; reason: string; sample?: string }> = [];

  const fields: Array<[string, any, boolean]> = [
    ["id", assertion?.id, false],
    ["rawId", assertion?.rawId, false],
    ["response.clientDataJSON", assertion?.response?.clientDataJSON, false],
    ["response.authenticatorData", assertion?.response?.authenticatorData, false],
    ["response.signature", assertion?.response?.signature, false],
    // userHandle は null のことがあるので optional 扱い
    ["response.userHandle", assertion?.response?.userHandle, true],
  ];

  for (const [name, value, optional] of fields) {
    if (value == null) {
      if (!optional) problems.push({ field: name, reason: "missing" });
      continue;
    }
    if (typeof value !== "string") {
      problems.push({ field: name, reason: `not string (${typeof value})` });
      continue;
    }
    try {
      const buf = base64urlToBufferStrict(value);
      // デコード後のバイト長だけ返せるようにする（秘密情報は出さない）
      void buf.length;
    } catch (e: any) {
      problems.push({
        field: name,
        reason: e?.message || "decode failed",
        sample: value.slice(0, 12), // 先頭だけ（漏洩対策）
      });
    }
  }

  return problems;
}

/* =========================================================
 * bytea -> Uint8Array(ArrayBuffer固定) for public_key
 * ========================================================= */
function bufferToStrictUint8(buf: Buffer): Uint8Array<ArrayBuffer> {
  const ab = new ArrayBuffer(buf.length);
  const view = new Uint8Array(ab);
  view.set(buf);
  return view;
}

function normalizeBytea(v: any): Uint8Array<ArrayBuffer> {
  if (!v) return new Uint8Array(new ArrayBuffer(0));

  if (Buffer.isBuffer(v)) return bufferToStrictUint8(v);

  if (v instanceof Uint8Array) return bufferToStrictUint8(Buffer.from(v));

  if (typeof v === "string") {
    try {
      if (v.startsWith("\\x")) {
        return bufferToStrictUint8(Buffer.from(v.slice(2), "hex"));
      }
      const s = v.replace(/-/g, "+").replace(/_/g, "/");
      const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
      return bufferToStrictUint8(Buffer.from(s + pad, "base64"));
    } catch {
      return new Uint8Array(new ArrayBuffer(0));
    }
  }

  if (v?.type === "Buffer" && Array.isArray(v?.data)) {
    return bufferToStrictUint8(Buffer.from(v.data));
  }

  return new Uint8Array(new ArrayBuffer(0));
}

/* =========================================================
 * runtime version logger (Vercelで実際に動いているversion確認)
 * ========================================================= */
function getPkgVersionSafe(name: string): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require(`${name}/package.json`);
    return pkg?.version ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    if (!ADMIN_EMAIL) {
      return NextResponse.json(
        { error: "ADMIN_EMAIL_ALLOWLIST is not configured" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const assertion: any = body?.assertion;
    const challengeId: string | undefined = body?.challengeId;
    const next: string | null = body?.next ?? null;

    if (!assertion || !challengeId) {
      return NextResponse.json(
        { error: "assertion/challengeId is required" },
        { status: 400 }
      );
    }

    // A) まず assertion の base64url 形式を厳密チェック
    const bad = validateAssertionBase64url(assertion);
    if (bad.length) {
      return NextResponse.json(
        {
          error: "assertion has invalid base64url field(s)",
          details: bad,
          debug: {
            serverVersion: getPkgVersionSafe("@simplewebauthn/server"),
            browserVersion: getPkgVersionSafe("@simplewebauthn/browser"),
          },
        },
        { status: 400 }
      );
    }

    // 1) challenge 消費
    const ch = await consumeChallenge(String(challengeId));
    if (!ch || ch.purpose !== "login") {
      return NextResponse.json({ error: "challenge not found" }, { status: 400 });
    }

    if (typeof ch.challenge !== "string") {
      return NextResponse.json(
        { error: "stored challenge is not string" },
        { status: 500 }
      );
    }
    // challenge 自体も base64url として妥当かチェック
    try {
      base64urlToBufferStrict(ch.challenge);
    } catch (e: any) {
      return NextResponse.json(
        { error: "stored challenge invalid", details: e?.message || "invalid" },
        { status: 500 }
      );
    }

    // 2) credential 取得
    const credentialIdFromClient = String(assertion.id);

    const { data: cred, error: credErr } = await supabaseAdmin
      .from("admin_webauthn_credentials")
      .select("credential_id, public_key, counter")
      .eq("admin_email", ADMIN_EMAIL)
      .eq("credential_id", credentialIdFromClient)
      .maybeSingle();

    if (credErr) {
      return NextResponse.json({ error: credErr.message }, { status: 500 });
    }
    if (!cred) {
      return NextResponse.json({ error: "credential not found" }, { status: 400 });
    }

    const publicKey = normalizeBytea(cred.public_key);

    // B) public_key の実体チェック（ここが壊れてるケースが多い）
    if (!publicKey.length) {
      return NextResponse.json(
        {
          error: "invalid public_key (empty after normalize)",
          debug: {
            storedType: typeof cred.public_key,
            isBuffer: Buffer.isBuffer(cred.public_key),
            hasTypeBufferShape: cred.public_key?.type === "Buffer",
            storedStringPrefix:
              typeof cred.public_key === "string"
                ? cred.public_key.slice(0, 12)
                : null,
            publicKeyLen: publicKey.length,
            serverVersion: getPkgVersionSafe("@simplewebauthn/server"),
            browserVersion: getPkgVersionSafe("@simplewebauthn/browser"),
          },
        },
        { status: 500 }
      );
    }

    const credentialID = String(cred.credential_id);
    const counter =
      typeof cred.counter === "number" && Number.isFinite(cred.counter) ? cred.counter : 0;

    // 3) verify（ここで落ちるなら version mismatch or assertion transform）
    let verification: any;
    try {
      verification = await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: ch.challenge, // ★ expectedChallenge は string
        expectedOrigin: ADMIN_ORIGIN,
        expectedRPID: ADMIN_RP_ID,
        credential: {
          id: credentialID,
          publicKey,
          counter,
        },
        requireUserVerification: false,
      });
    } catch (e: any) {
      return NextResponse.json(
        {
          error: e?.message || "verifyAuthenticationResponse threw",
          debug: {
            sizes: {
              id: base64urlToBufferStrict(String(assertion.id)).length,
              rawId: base64urlToBufferStrict(String(assertion.rawId)).length,
              "response.clientDataJSON": base64urlToBufferStrict(
                String(assertion.response.clientDataJSON)
              ).length,
              "response.authenticatorData": base64urlToBufferStrict(
                String(assertion.response.authenticatorData)
              ).length,
              "response.signature": base64urlToBufferStrict(
                String(assertion.response.signature)
              ).length,
              "response.userHandle": assertion.response.userHandle
                ? base64urlToBufferStrict(String(assertion.response.userHandle)).length
                : null,
            },
            rpId: ADMIN_RP_ID,
            origin: ADMIN_ORIGIN,
            credentialID_len: credentialID.length,
            publicKeyLen: publicKey.length,
            serverVersion: getPkgVersionSafe("@simplewebauthn/server"),
            browserVersion: getPkgVersionSafe("@simplewebauthn/browser"),
          },
          hint:
            "If base64url checks & challenge/origin/rpId are OK, remaining suspects are (1) @simplewebauthn/server vs browser major version mismatch, or (2) stored public_key is not the expected COSE public key bytes.",
        },
        { status: 500 }
      );
    }

    if (!verification.verified) {
      return NextResponse.json({ error: "authentication not verified" }, { status: 401 });
    }

    // 4) counter 更新
    const newCounter = verification.authenticationInfo.newCounter;
    await supabaseAdmin
      .from("admin_webauthn_credentials")
      .update({ counter: newCounter, last_used_at: new Date().toISOString() })
      .eq("admin_email", ADMIN_EMAIL)
      .eq("credential_id", cred.credential_id);

    // 5) admin session（Cookieは NextResponse に付ける）
    const { sessionId, expiresAt } = await createAdminSession(ADMIN_EMAIL);
    const res = NextResponse.json({ ok: true, redirectTo: safeNext(next) });
    applyAdminSessionCookie(res, sessionId, expiresAt);
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "verify error" }, { status: 500 });
  }
}