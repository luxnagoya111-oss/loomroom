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
import { createAdminSession, applyAdminSessionCookie } from "@/lib/adminSession";

export const runtime = "nodejs";

const ADMIN_EMAIL = ADMIN_EMAIL_ALLOWLIST[0] || null;

function safeNext(next: string | null) {
  if (!next) return "/admin";
  return next.startsWith("/") ? next : "/admin";
}

/* =========================================================
 * base64url strict
 * ========================================================= */
function isBase64url(s: string): boolean {
  return /^[A-Za-z0-9\-_]+$/.test(s);
}
function base64urlToBufferStrict(s: string): Buffer {
  if (typeof s !== "string") throw new Error("not a string");
  if (!isBase64url(s)) throw new Error("contains non-base64url chars");
  if (s.length % 4 === 1) throw new Error("invalid length (mod 4 === 1)");
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, "base64");
}
function validateFieldBase64url(obj: any, path: string, allowNull = false) {
  const value = path.split(".").reduce((acc, k) => acc?.[k], obj);

  if (value == null) {
    if (allowNull) return { ok: true as const };
    return { ok: false as const, reason: "missing" };
  }
  if (typeof value !== "string") {
    return { ok: false as const, reason: `not string (type=${typeof value})` };
  }
  try {
    const buf = base64urlToBufferStrict(value);
    return { ok: true as const, bytes: buf.length };
  } catch (e: any) {
    return { ok: false as const, reason: e?.message || "decode failed" };
  }
}

/* =========================================================
 * DB credential_id を「確実に base64url 文字列」にする
 * - text でも bytea(Buffer) でも吸収
 * ========================================================= */
function toBase64urlFromBytes(bytes: Uint8Array): string {
  const b64 = Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function normalizeCredentialIdFromDb(v: any): string {
  if (!v) return "";

  // 既に文字列ならそのまま（ただし余計な空白は除去）
  if (typeof v === "string") return v.trim();

  // Buffer(bytea)
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(v)) {
    return toBase64urlFromBytes(new Uint8Array(v));
  }

  // Uint8Array
  if (v instanceof Uint8Array) {
    return toBase64urlFromBytes(v);
  }

  // { type:"Buffer", data:number[] } 形式
  if (typeof v === "object" && v.type === "Buffer" && Array.isArray(v.data)) {
    return toBase64urlFromBytes(Uint8Array.from(v.data));
  }

  // postgrest が "\\x..." を返すケース
  if (typeof v === "object" && typeof v?.toString === "function") {
    const s = String(v);
    if (s.startsWith("\\x")) {
      const buf = Buffer.from(s.slice(2), "hex");
      return toBase64urlFromBytes(new Uint8Array(buf));
    }
    return s.trim();
  }

  return String(v).trim();
}

/* =========================================================
 * bytea -> Uint8Array<ArrayBuffer固定> (public_key用)
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
      if (v.startsWith("\\x")) return bufferToStrictUint8(Buffer.from(v.slice(2), "hex"));
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

function isNonEmptyString(v: any): v is string {
  return typeof v === "string" && v.length > 0;
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

    // assertion最低限
    if (!isNonEmptyString(assertion?.id) || !isNonEmptyString(assertion?.rawId)) {
      return NextResponse.json({ error: "assertion.id/rawId is required" }, { status: 400 });
    }
    if (assertion?.type !== "public-key") {
      return NextResponse.json(
        { error: "assertion.type must be public-key", got: assertion?.type },
        { status: 400 }
      );
    }

    // 1) challenge 消費
    const ch = await consumeChallenge(String(challengeId));
    if (!ch || ch.purpose !== "login") {
      return NextResponse.json({ error: "challenge not found" }, { status: 400 });
    }
    if (!isNonEmptyString(ch.challenge)) {
      return NextResponse.json({ error: "stored challenge is invalid" }, { status: 500 });
    }

    // 2) assertion の base64url 妥当性チェック
    const checks = [
      { field: "id", path: "id", allowNull: false },
      { field: "rawId", path: "rawId", allowNull: false },
      { field: "response.clientDataJSON", path: "response.clientDataJSON", allowNull: false },
      { field: "response.authenticatorData", path: "response.authenticatorData", allowNull: false },
      { field: "response.signature", path: "response.signature", allowNull: false },
      { field: "response.userHandle", path: "response.userHandle", allowNull: true },
    ] as const;

    const bad: Array<{ field: string; reason: string }> = [];
    const sizes: Record<string, number> = {};
    for (const c of checks) {
      const r = validateFieldBase64url(assertion, c.path, c.allowNull);
      if (!r.ok) bad.push({ field: c.field, reason: r.reason });
      else if (typeof (r as any).bytes === "number") sizes[c.field] = (r as any).bytes;
    }
    if (bad.length) {
      return NextResponse.json(
        { error: "assertion contains invalid base64url field(s)", details: bad },
        { status: 400 }
      );
    }

    // 3) credential 取得
    const credentialIdFromClient = String(assertion.id);

    const { data: cred, error } = await supabaseAdmin
      .from("admin_webauthn_credentials")
      .select("credential_id, public_key, counter")
      .eq("admin_email", ADMIN_EMAIL)
      .eq("credential_id", credentialIdFromClient)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!cred) {
      return NextResponse.json(
        { error: "credential not found (id mismatch)", credentialIdFromClient },
        { status: 400 }
      );
    }

    // ★ ここが根治ポイント：DBのcredential_idを必ずbase64urlへ
    const credentialID = normalizeCredentialIdFromDb(cred.credential_id);

    // もしここが壊れてたら即わかるように返す
    try {
      base64urlToBufferStrict(credentialID);
    } catch (e: any) {
      return NextResponse.json(
        {
          error: "stored credential_id is not valid base64url",
          details: e?.message || "invalid credential_id",
          debug: {
            rawType: typeof cred.credential_id,
            credentialID_preview: String(credentialID).slice(0, 60),
            credentialID_len: credentialID.length,
          },
        },
        { status: 500 }
      );
    }

    const publicKey = normalizeBytea(cred.public_key);
    if (!publicKey.length) {
      return NextResponse.json({ error: "invalid public_key" }, { status: 500 });
    }

    const counter =
      typeof cred.counter === "number" && Number.isFinite(cred.counter) ? cred.counter : 0;

    // 4) verify
    let verification: any;
    try {
      verification = await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: ch.challenge, // string
        expectedOrigin: ADMIN_ORIGIN,
        expectedRPID: ADMIN_RP_ID,
        credential: {
          id: credentialID, // ★正規化済み
          publicKey,
          counter,
        },
        requireUserVerification: false,
      });
    } catch (e: any) {
      return NextResponse.json(
        {
          error: e?.message || "verifyAuthenticationResponse threw",
          debug: { sizes, rpId: ADMIN_RP_ID, origin: ADMIN_ORIGIN, credentialID_len: credentialID.length },
          hint:
            "If this still fails, the remaining suspects are library version mismatch or an unexpected credential/publicKey format. Next step: log @simplewebauthn/server version and inspect stored public_key length.",
        },
        { status: 500 }
      );
    }

    if (!verification.verified) {
      return NextResponse.json({ error: "authentication not verified" }, { status: 401 });
    }

    // 5) counter 更新
    const newCounter = verification.authenticationInfo.newCounter;

    await supabaseAdmin
      .from("admin_webauthn_credentials")
      .update({ counter: newCounter, last_used_at: new Date().toISOString() })
      .eq("admin_email", ADMIN_EMAIL)
      .eq("credential_id", cred.credential_id);

    // 6) admin session + cookie
    const { sessionId, expiresAt } = await createAdminSession(ADMIN_EMAIL);

    const res = NextResponse.json({
      ok: true,
      redirectTo: safeNext(next),
    });
    applyAdminSessionCookie(res, sessionId, expiresAt);
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "verify error" }, { status: 500 });
  }
}