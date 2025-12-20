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
 * bytea / Uint8Array を ArrayBuffer 固定 Uint8Array に変換
 * SharedArrayBuffer 完全排除版（DB public_key 用）
 * ========================================================= */
function bufferToStrictUint8(buf: Buffer): Uint8Array<ArrayBuffer> {
  const ab = new ArrayBuffer(buf.length);
  const view = new Uint8Array(ab);
  view.set(buf);
  return view;
}

function normalizeBytea(v: any): Uint8Array<ArrayBuffer> {
  if (!v) return new Uint8Array(new ArrayBuffer(0));

  if (Buffer.isBuffer(v)) {
    return bufferToStrictUint8(v);
  }

  if (v instanceof Uint8Array) {
    return bufferToStrictUint8(Buffer.from(v));
  }

  if (typeof v === "string") {
    try {
      if (v.startsWith("\\x")) {
        return bufferToStrictUint8(Buffer.from(v.slice(2), "hex"));
      }
      // base64 / base64url の両方を許容
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
 * assertion の「base64url 正規化」
 * - @simplewebauthn/server は JSON で base64url 文字列を期待
 * - Uint8Array / ArrayBuffer / {type:"Buffer"} を吸収
 * ========================================================= */

function bytesToBase64url(bytes: Uint8Array): string {
  const b64 = Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function coerceToBase64url(v: any): string | undefined {
  if (v == null) return undefined;

  if (typeof v === "string") {
    // 既にbase64urlっぽいならそのまま
    if (/^[A-Za-z0-9\-_]+$/.test(v)) return v;

    // base64っぽいならbase64urlへ変換
    if (/^[A-Za-z0-9+/=]+$/.test(v)) {
      return v.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }

    // その他はそのまま返す（原因追跡のため）
    return v;
  }

  if (v instanceof Uint8Array) return bytesToBase64url(v);

  if (v instanceof ArrayBuffer) return bytesToBase64url(new Uint8Array(v));

  // JSON化されたBuffer
  if (typeof v === "object" && v.type === "Buffer" && Array.isArray(v.data)) {
    return bytesToBase64url(Uint8Array.from(v.data));
  }

  return undefined;
}

function normalizeAssertion(input: any) {
  const a = input ?? {};

  const id = coerceToBase64url(a.id) ?? a.id;
  const rawId = coerceToBase64url(a.rawId) ?? a.rawId;

  const clientDataJSON =
    coerceToBase64url(a?.response?.clientDataJSON) ??
    a?.response?.clientDataJSON;
  const authenticatorData =
    coerceToBase64url(a?.response?.authenticatorData) ??
    a?.response?.authenticatorData;
  const signature =
    coerceToBase64url(a?.response?.signature) ?? a?.response?.signature;
  const userHandle =
    coerceToBase64url(a?.response?.userHandle) ?? a?.response?.userHandle;

  return {
    ...a,
    id,
    rawId,
    response: {
      ...a?.response,
      clientDataJSON,
      authenticatorData,
      signature,
      userHandle,
    },
  };
}

/* =========================================================
 * credential を id / rawId で探索（保存形式ブレの保険）
 * ========================================================= */
async function findCredentialForAdmin(params: {
  adminEmail: string;
  credentialId: string;
  credentialRawId?: string | null;
}) {
  const { adminEmail, credentialId, credentialRawId } = params;

  // 1) assertion.id で検索
  {
    const { data, error } = await supabaseAdmin
      .from("admin_webauthn_credentials")
      .select("credential_id, public_key, counter")
      .eq("admin_email", adminEmail)
      .eq("credential_id", credentialId)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  // 2) assertion.rawId でも検索（保険）
  if (credentialRawId) {
    const { data, error } = await supabaseAdmin
      .from("admin_webauthn_credentials")
      .select("credential_id, public_key, counter")
      .eq("admin_email", adminEmail)
      .eq("credential_id", credentialRawId)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  return null;
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
    const assertionRaw: any = body?.assertion;
    const challengeId: string | undefined = body?.challengeId;
    const next: string | null = body?.next ?? null;

    if (!assertionRaw || !challengeId) {
      return NextResponse.json(
        { error: "assertion/challengeId is required" },
        { status: 400 }
      );
    }

    // ★ ここで正規化（壊れた入力の吸収）
    const assertion = normalizeAssertion(assertionRaw);

    if (!assertion?.id || !assertion?.response) {
      return NextResponse.json(
        { error: "invalid assertion payload" },
        { status: 400 }
      );
    }

    // 1) challenge 消費
    const ch = await consumeChallenge(String(challengeId));
    if (!ch || ch.purpose !== "login") {
      return NextResponse.json(
        { error: "challenge not found" },
        { status: 400 }
      );
    }

    // 2) credential 取得（id → rawId の順で探索）
    const credentialIdFromClient = String(assertion.id);
    const credentialRawIdFromClient = assertion.rawId
      ? String(assertion.rawId)
      : null;

    let cred: any = null;
    try {
      cred = await findCredentialForAdmin({
        adminEmail: ADMIN_EMAIL,
        credentialId: credentialIdFromClient,
        credentialRawId: credentialRawIdFromClient,
      });
    } catch (dbErr: any) {
      return NextResponse.json(
        { error: dbErr?.message || "credential lookup failed" },
        { status: 500 }
      );
    }

    if (!cred) {
      return NextResponse.json(
        { error: "credential not found" },
        { status: 400 }
      );
    }

    const publicKey = normalizeBytea(cred.public_key);
    if (!publicKey.length) {
      return NextResponse.json({ error: "invalid public_key" }, { status: 500 });
    }

    // ★ ここは string 固定（型定義に合わせる）
    const credentialID = String(cred.credential_id);

    const counter =
      typeof cred.counter === "number" && Number.isFinite(cred.counter)
        ? cred.counter
        : 0;

    // 3) verify
    const verification = await verifyAuthenticationResponse({
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