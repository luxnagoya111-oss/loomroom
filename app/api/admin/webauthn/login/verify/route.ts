// app/api/admin/webauthn/login/verify/route.ts
import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";

import {
  ADMIN_EMAIL_ALLOWLIST,
  ADMIN_ORIGIN,
  ADMIN_RP_ID,
} from "@/lib/adminConfig";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createAdminSession } from "@/lib/adminSession";
import { consumeChallenge } from "../../_store";

export const runtime = "nodejs";

const ADMIN_EMAIL = ADMIN_EMAIL_ALLOWLIST[0] || null;

function safeNext(next: string | null) {
  if (!next) return "/admin";
  return next.startsWith("/") ? next : "/admin";
}

/* =========================================================
 * base64url validator / decoder
 * - ここで「どのフィールドが壊れてるか」特定する
 * ========================================================= */
function isBase64urlString(s: string): boolean {
  return /^[A-Za-z0-9\-_]*$/.test(s);
}

function base64urlToBufferStrict(s: string): Buffer {
  // @simplewebauthn/server が内部でやってる前提の変換に近づける
  // - base64url 以外の文字が混ざっていたら即エラー
  // - 長さ mod 4 === 1 は base64 として不正
  if (typeof s !== "string") throw new Error("not a string");
  if (!isBase64urlString(s)) throw new Error("contains non-base64url chars");
  if (s.length % 4 === 1) throw new Error("invalid base64url length (mod 4 === 1)");

  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, "base64");
}

function assertFieldBase64url(obj: any, path: string): { ok: true } | { ok: false; reason: string } {
  const value = path.split(".").reduce((acc, key) => acc?.[key], obj);

  // userHandle は null の可能性がある（その場合はOK）
  if (value == null) return { ok: true };

  if (typeof value !== "string") {
    return { ok: false, reason: `not string (type=${typeof value})` };
  }

  try {
    base64urlToBufferStrict(value);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message || "decode failed" };
  }
}

/* =========================================================
 * bytea -> Uint8Array(ArrayBuffer固定) 変換（public_key用）
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
      // base64 / base64url の両方許容
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

async function findCredentialForAdmin(params: {
  adminEmail: string;
  credentialId: string;
}) {
  const { adminEmail, credentialId } = params;

  const { data, error } = await supabaseAdmin
    .from("admin_webauthn_credentials")
    .select("credential_id, public_key, counter")
    .eq("admin_email", adminEmail)
    .eq("credential_id", credentialId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
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

    // 0) 事前に「base64urlとして壊れてる箇所」を特定して返す
    //    ここで原因が pinpoint できる
    const checks = [
      ["id", "id"],
      ["rawId", "rawId"],
      ["response.clientDataJSON", "response.clientDataJSON"],
      ["response.authenticatorData", "response.authenticatorData"],
      ["response.signature", "response.signature"],
      ["response.userHandle", "response.userHandle"], // nullはOK
    ] as const;

    const bad: Array<{ field: string; reason: string }> = [];
    for (const [field, path] of checks) {
      const r = assertFieldBase64url(assertion, path);
      if (!r.ok) bad.push({ field, reason: r.reason });
    }
    if (bad.length) {
      return NextResponse.json(
        {
          error: "assertion payload contains invalid base64url field(s)",
          details: bad,
        },
        { status: 400 }
      );
    }

    // 1) challenge 消費
    const ch = await consumeChallenge(String(challengeId));
    if (!ch || ch.purpose !== "login") {
      return NextResponse.json({ error: "challenge not found" }, { status: 400 });
    }

    // 念のため expectedChallenge も形式チェック（壊れてたら即わかる）
    try {
      // challenge は base64url 文字列の想定
      if (typeof ch.challenge !== "string") throw new Error("challenge not string");
      if (!isBase64urlString(ch.challenge)) throw new Error("challenge has invalid chars");
      if (ch.challenge.length % 4 === 1) throw new Error("challenge invalid length");
    } catch (e: any) {
      return NextResponse.json(
        { error: "stored challenge is invalid", details: e?.message || "invalid challenge" },
        { status: 500 }
      );
    }

    // 2) credential 取得（登録した id で一致するはず）
    const credentialIdFromClient = String(assertion.id);

    const cred = await findCredentialForAdmin({
      adminEmail: ADMIN_EMAIL,
      credentialId: credentialIdFromClient,
    });

    if (!cred) {
      return NextResponse.json(
        { error: "credential not found (id mismatch)" },
        { status: 400 }
      );
    }

    const publicKey = normalizeBytea(cred.public_key);
    if (!publicKey.length) {
      return NextResponse.json({ error: "invalid public_key" }, { status: 500 });
    }

    const credentialID = String(cred.credential_id);
    const counter =
      typeof cred.counter === "number" && Number.isFinite(cred.counter)
        ? cred.counter
        : 0;

    // 3) verify（ここで落ちるなら、上の事前チェックでは拾えない “内部パース” の問題）
    let verification: any;
    try {
      verification = await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: ch.challenge,
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
      // ここで “Length not supported...” の発生源をより分かりやすく返す
      return NextResponse.json(
        {
          error: e?.message || "verifyAuthenticationResponse threw",
          hint:
            "If this persists, the assertion fields may be base64 (not base64url) or include unexpected chars; see details returned earlier.",
        },
        { status: 500 }
      );
    }

    if (!verification.verified) {
      return NextResponse.json(
        { error: "authentication not verified" },
        { status: 401 }
      );
    }

    // 4) counter 更新
    const newCounter = verification.authenticationInfo.newCounter;

    await supabaseAdmin
      .from("admin_webauthn_credentials")
      .update({
        counter: newCounter,
        last_used_at: new Date().toISOString(),
      })
      .eq("admin_email", ADMIN_EMAIL)
      .eq("credential_id", cred.credential_id);

    // 5) admin session
    await createAdminSession(ADMIN_EMAIL);

    return NextResponse.json({
      ok: true,
      redirectTo: safeNext(next),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "verify error" },
      { status: 500 }
    );
  }
}