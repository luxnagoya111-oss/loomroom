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
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = ADMIN_EMAIL_ALLOWLIST[0] || null;

function safeNext(next: string | null) {
  if (!next) return "/admin";
  return next.startsWith("/") ? next : "/admin";
}

/* =========================================================
 * DB bytea(public_key) -> Uint8Array<ArrayBuffer>
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
      // base64url/base64 を許容
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
 * assertion base64url normalization
 * - server は base64url string を期待
 * - Uint8Array / ArrayBuffer / JSON Buffer を base64url string に変換
 * - 変換不能な object は「undefined」にして後段で弾く
 * ========================================================= */

function bytesToBase64url(bytes: Uint8Array): string {
  const b64 = Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function isBase64UrlLike(s: string): boolean {
  // base64url の文字集合のみ許可（パディングなし前提）
  return /^[A-Za-z0-9\-_]+$/.test(s);
}

function coerceToBase64url(v: any): string | undefined {
  if (v == null) return undefined;

  if (typeof v === "string") {
    // base64url ならそのまま
    if (isBase64UrlLike(v)) return v;

    // base64 っぽいなら base64url へ
    if (/^[A-Za-z0-9+/=]+$/.test(v)) {
      return v.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }

    // その他の文字列は「危険」なので undefined にする（内部で Length… を起こしやすい）
    return undefined;
  }

  if (v instanceof Uint8Array) return bytesToBase64url(v);

  if (v instanceof ArrayBuffer) return bytesToBase64url(new Uint8Array(v));

  // JSON化 Buffer
  if (typeof v === "object" && v.type === "Buffer" && Array.isArray(v.data)) {
    return bytesToBase64url(Uint8Array.from(v.data));
  }

  return undefined;
}

function normalizeAssertion(input: any) {
  const a = input ?? {};

  const id = coerceToBase64url(a.id);
  const rawId = coerceToBase64url(a.rawId);

  const clientDataJSON = coerceToBase64url(a?.response?.clientDataJSON);
  const authenticatorData = coerceToBase64url(a?.response?.authenticatorData);
  const signature = coerceToBase64url(a?.response?.signature);

  // userHandle は null/undefined のことがあるので optional
  const userHandle = coerceToBase64url(a?.response?.userHandle);

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
 * credential lookup
 * ========================================================= */
async function findCredentialForAdmin(params: {
  adminEmail: string;
  credentialId?: string;
  credentialRawId?: string;
}) {
  const { adminEmail, credentialId, credentialRawId } = params;

  // 1) id
  if (credentialId) {
    const { data, error } = await supabaseAdmin
      .from("admin_webauthn_credentials")
      .select("credential_id, public_key, counter")
      .eq("admin_email", adminEmail)
      .eq("credential_id", credentialId)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  // 2) rawId
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

    const assertion = normalizeAssertion(assertionRaw);

    // ✅ ここで「壊れた assertion」を明確に弾く（Length… の根本対策）
    const missing: string[] = [];
    if (!assertion?.id) missing.push("assertion.id");
    if (!assertion?.rawId) missing.push("assertion.rawId");
    if (!assertion?.response?.clientDataJSON) missing.push("response.clientDataJSON");
    if (!assertion?.response?.authenticatorData) missing.push("response.authenticatorData");
    if (!assertion?.response?.signature) missing.push("response.signature");

    if (missing.length) {
      return NextResponse.json(
        {
          error: "invalid assertion payload (non-base64url or missing fields)",
          missing,
          // デバッグしやすいように型だけ返す（中身は返さない）
          types: {
            id: typeof assertionRaw?.id,
            rawId: typeof assertionRaw?.rawId,
            clientDataJSON: typeof assertionRaw?.response?.clientDataJSON,
            authenticatorData: typeof assertionRaw?.response?.authenticatorData,
            signature: typeof assertionRaw?.response?.signature,
            userHandle: typeof assertionRaw?.response?.userHandle,
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

    // 2) credential 取得
    let cred: any = null;
    try {
      cred = await findCredentialForAdmin({
        adminEmail: ADMIN_EMAIL,
        credentialId: String(assertion.id),
        credentialRawId: String(assertion.rawId),
      });
    } catch (dbErr: any) {
      return NextResponse.json(
        { error: dbErr?.message || "credential lookup failed" },
        { status: 500 }
      );
    }

    if (!cred) {
      return NextResponse.json({ error: "credential not found" }, { status: 400 });
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

    // 3) verify
    const verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: String(ch.challenge),
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