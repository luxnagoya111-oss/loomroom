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

  if (typeof cd === "string") {
    try {
      const json = JSON.parse(base64urlToUtf8(cd));
      return typeof json?.challenge === "string" ? json.challenge : null;
    } catch {
      return null;
    }
  }

  // ArrayBuffer/Uint8Array/Buffer JSON などの保険
  try {
    const buf =
      cd instanceof ArrayBuffer
        ? Buffer.from(cd)
        : cd instanceof Uint8Array
        ? Buffer.from(cd)
        : typeof cd === "object" && cd?.type === "Buffer" && Array.isArray(cd?.data)
        ? Buffer.from(cd.data)
        : Buffer.from(cd?.buffer ?? cd);

    const json = JSON.parse(buf.toString("utf8"));
    return typeof json?.challenge === "string" ? json.challenge : null;
  } catch {
    return null;
  }
}

/* =========================================================
 * challenge 文字列でDB照会して消費（challengeIdが無い場合の救済）
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

  await supabaseAdmin.from("admin_webauthn_challenges").delete().eq("id", data.id);
  return data as any;
}

/* =========================================================
 * attestation normalization
 * - server は base64url string を期待
 * - Uint8Array / ArrayBuffer / JSON Buffer を base64url 文字列へ
 * - 変換できない string/object は undefined にして後段で弾く
 * ========================================================= */

function bytesToBase64url(bytes: Uint8Array): string {
  const b64 = Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function isBase64UrlLike(s: string): boolean {
  return /^[A-Za-z0-9\-_]+$/.test(s);
}

function coerceToBase64url(v: any): string | undefined {
  if (v == null) return undefined;

  if (typeof v === "string") {
    if (isBase64UrlLike(v)) return v;
    if (/^[A-Za-z0-9+/=]+$/.test(v)) {
      return v.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }
    // それ以外の “文字列” は危険（内部で Length… を誘発しやすい）なので弾く
    return undefined;
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

  const id = coerceToBase64url(a.id);
  const rawId = coerceToBase64url(a.rawId);

  const clientDataJSON = coerceToBase64url(a?.response?.clientDataJSON);
  const attestationObject = coerceToBase64url(a?.response?.attestationObject);

  // transports は browser が返す場合のみ、そのまま
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
    const attestationRaw = body?.attestation;
    const challengeId = body?.challengeId;

    if (!attestationRaw) {
      return NextResponse.json(
        { error: "attestation is required" },
        { status: 400 }
      );
    }

    const attestation = normalizeAttestation(attestationRaw);

    // ✅ 必須フィールドチェック（ここで落とせば Length… は確実に止まる）
    const missing: string[] = [];
    if (!attestation?.id) missing.push("attestation.id");
    if (!attestation?.rawId) missing.push("attestation.rawId");
    if (!attestation?.response?.clientDataJSON) missing.push("response.clientDataJSON");
    if (!attestation?.response?.attestationObject) missing.push("response.attestationObject");

    if (missing.length) {
      return NextResponse.json(
        {
          error: "invalid attestation payload (non-base64url or missing fields)",
          missing,
          types: {
            id: typeof attestationRaw?.id,
            rawId: typeof attestationRaw?.rawId,
            clientDataJSON: typeof attestationRaw?.response?.clientDataJSON,
            attestationObject: typeof attestationRaw?.response?.attestationObject,
          },
        },
        { status: 400 }
      );
    }

    // 1) challenge を取得（challengeId 優先、無ければ clientDataJSON から抽出）
    let ch: any = null;

    if (challengeId) {
      ch = await consumeChallenge(String(challengeId));
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
      expectedChallenge: String(ch.challenge),
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

    // browser から来た JSON の id を正とする（DB は base64url string で保持）
    const credentialID = String(attestation.id);
    if (!credentialID) {
      return NextResponse.json({ error: "invalid credential id" }, { status: 400 });
    }

    const credentialPublicKey = reg.credential.publicKey;
    const counter = reg.credential.counter;

    const { error: upsertErr } = await supabaseAdmin
      .from("admin_webauthn_credentials")
      .upsert(
        {
          admin_email: ADMIN_EMAIL,
          credential_id: credentialID,
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