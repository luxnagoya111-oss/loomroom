// app/api/admin/webauthn/register/verify/route.ts
import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import {
  ADMIN_EMAIL_ALLOWLIST,
  ADMIN_RP_ID,
  ADMIN_ORIGIN,
} from "@/lib/adminConfig";
import { consumeChallenge } from "../../_store";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = ADMIN_EMAIL_ALLOWLIST[0] || null;

/* =========================================================
 * base64url utils（challenge抽出用）
 * ========================================================= */
function base64urlToUtf8(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  return Buffer.from(b64 + pad, "base64").toString("utf8");
}

function pickChallengeFromClientDataJSON(attestation: any): string | null {
  const cd = attestation?.response?.clientDataJSON;
  if (!cd) return null;

  // cd が string の場合（base64url想定）
  if (typeof cd === "string") {
    try {
      const json = JSON.parse(base64urlToUtf8(cd));
      return typeof json?.challenge === "string" ? json.challenge : null;
    } catch {
      return null;
    }
  }

  // cd が ArrayBuffer/Uint8Array の場合（保険）
  try {
    const buf =
      cd instanceof ArrayBuffer
        ? Buffer.from(cd)
        : Buffer.from(cd?.buffer ?? cd);
    const json = JSON.parse(buf.toString("utf8"));
    return typeof json?.challenge === "string" ? json.challenge : null;
  } catch {
    return null;
  }
}

/* =========================================================
 * challenge 文字列でDB照会して消費（challengeId が無い場合の救済）
 * ========================================================= */
async function consumeChallengeByValue(
  purpose: "register" | "login",
  challenge: string
) {
  const { data, error } = await supabaseAdmin
    .from("admin_webauthn_challenges")
    .select("*")
    .eq("purpose", purpose)
    .eq("challenge", challenge)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  await supabaseAdmin
    .from("admin_webauthn_challenges")
    .delete()
    .eq("id", data.id);

  return data as any;
}

/* =========================================================
 * attestation の「base64url 正規化」
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
    // base64urlっぽいならそのまま
    if (/^[A-Za-z0-9\-_]+$/.test(v)) return v;

    // base64っぽいならbase64urlへ
    if (/^[A-Za-z0-9+/=]+$/.test(v)) {
      return v.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }

    return v;
  }

  if (v instanceof Uint8Array) return bytesToBase64url(v);

  if (v instanceof ArrayBuffer) return bytesToBase64url(new Uint8Array(v));

  if (typeof v === "object" && v.type === "Buffer" && Array.isArray(v.data)) {
    return bytesToBase64url(Uint8Array.from(v.data));
  }

  return undefined;
}

function normalizeAttestation(input: any) {
  const a = input ?? {};

  const id = coerceToBase64url(a.id) ?? a.id;
  const rawId = coerceToBase64url(a.rawId) ?? a.rawId;

  const clientDataJSON =
    coerceToBase64url(a?.response?.clientDataJSON) ?? a?.response?.clientDataJSON;

  const attestationObject =
    coerceToBase64url(a?.response?.attestationObject) ??
    a?.response?.attestationObject;

  const transports = Array.isArray(a?.response?.transports)
    ? a.response.transports
    : undefined;

  return {
    ...a,
    id,
    rawId,
    response: {
      ...a?.response,
      clientDataJSON,
      attestationObject,
      ...(transports ? { transports } : {}),
    },
  };
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
    const { attestation: attestationRaw, challengeId } = body || {};

    if (!attestationRaw) {
      return NextResponse.json(
        { error: "attestation is required" },
        { status: 400 }
      );
    }

    // ★ verify に渡す前に正規化
    const attestation = normalizeAttestation(attestationRaw);

    // 1) challenge を取得（challengeId 優先、無ければ clientDataJSON から抽出して照会）
    let ch: any = null;

    if (challengeId) {
      ch = await consumeChallenge(challengeId);
      if (ch && ch.purpose !== "register") ch = null;
    }

    if (!ch) {
      const extracted = pickChallengeFromClientDataJSON(attestation);
      if (!extracted) {
        return NextResponse.json(
          {
            error:
              "challenge not found (missing challengeId and cannot extract challenge)",
          },
          { status: 400 }
        );
      }
      ch = await consumeChallengeByValue("register", extracted);
    }

    if (!ch) {
      return NextResponse.json({ error: "challenge not found" }, { status: 400 });
    }

    const verification = await verifyRegistrationResponse({
      response: attestation,
      expectedChallenge: ch.challenge,
      expectedOrigin: ADMIN_ORIGIN,
      expectedRPID: ADMIN_RP_ID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json(
        { error: "registration not verified" },
        { status: 400 }
      );
    }

    const reg = verification.registrationInfo;

    // ★ browser から来た JSON の id を正とする
    const credentialID = String(attestation.id);
    if (!credentialID) {
      return NextResponse.json(
        { error: "invalid credential id" },
        { status: 400 }
      );
    }

    const credentialPublicKey = reg.credential.publicKey;
    const counter = reg.credential.counter;

    // 同じ credential_id がすでにある場合を吸収（再登録・二重登録の保険）
    // onConflict を使えない場合もあるので、upsert で統一
    const { error: upsertErr } = await supabaseAdmin
      .from("admin_webauthn_credentials")
      .upsert(
        {
          admin_email: ADMIN_EMAIL,
          credential_id: credentialID, // base64url string
          public_key: Buffer.from(credentialPublicKey),
          counter,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "admin_email,credential_id" }
      );

    if (upsertErr) {
      return NextResponse.json(
        { error: upsertErr.message || "credential save failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "verify error" },
      { status: 500 }
    );
  }
}