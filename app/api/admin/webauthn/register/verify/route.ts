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
 * challenge 文字列でDB照会して消費
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

  return data;
}

/* =========================================================
 * attestation の base64url 正規化
 * ========================================================= */
function bytesToBase64url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function coerceToBase64url(v: any): string | undefined {
  if (v == null) return undefined;

  if (typeof v === "string") {
    // base64url
    if (/^[A-Za-z0-9\-_]+$/.test(v)) return v;
    // base64
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

  return {
    ...a,
    id: coerceToBase64url(a.id) ?? a.id,
    rawId: coerceToBase64url(a.rawId) ?? a.rawId,
    response: {
      ...a.response,
      clientDataJSON:
        coerceToBase64url(a?.response?.clientDataJSON) ??
        a?.response?.clientDataJSON,
      attestationObject:
        coerceToBase64url(a?.response?.attestationObject) ??
        a?.response?.attestationObject,
      ...(Array.isArray(a?.response?.transports)
        ? { transports: a.response.transports }
        : {}),
    },
  };
}

/* =========================================================
 * Uint8Array 正規化（registrationInfoのバラつき吸収）
 * ========================================================= */
function toUint8(v: any): Uint8Array | null {
  if (!v) return null;
  if (v instanceof Uint8Array) return v;
  if (Buffer.isBuffer(v)) return new Uint8Array(v);
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (typeof v === "object" && v.type === "Buffer" && Array.isArray(v.data)) {
    return Uint8Array.from(v.data);
  }
  if (Array.isArray(v) && v.every((n) => typeof n === "number")) {
    return Uint8Array.from(v);
  }
  return null;
}

function pickRegistrationKey(
  regInfo: any
): { publicKey: Uint8Array; counter: number } | null {
  if (!regInfo) return null;

  // パターンA: registrationInfo.credentialPublicKey / counter
  const a = toUint8(regInfo.credentialPublicKey);
  if (a) return { publicKey: a, counter: typeof regInfo.counter === "number" ? regInfo.counter : 0 };

  // パターンB: registrationInfo.credential.publicKey / counter
  const b = toUint8(regInfo.credential?.publicKey);
  if (b)
    return {
      publicKey: b,
      counter: typeof regInfo.credential?.counter === "number" ? regInfo.credential.counter : 0,
    };

  return null;
}

function isBase64url(s: string): boolean {
  return typeof s === "string" && /^[A-Za-z0-9\-_]+$/.test(s) && s.length > 0;
}

/* =========================================================
 * POST
 * ========================================================= */
export async function POST(req: Request) {
  try {
    if (!ADMIN_EMAIL) {
      return NextResponse.json(
        { error: "ADMIN_EMAIL_ALLOWLIST is not configured" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const raw = body?.attestation;
    const challengeId = body?.challengeId;

    if (!raw) {
      return NextResponse.json(
        { error: "attestation is required" },
        { status: 400 }
      );
    }

    const attestation = normalizeAttestation(raw);

    // 1) challenge 取得（challengeId優先、無ければ clientDataJSON から抽出）
    let ch: any = challengeId ? await consumeChallenge(challengeId) : null;

    if (!ch) {
      const extracted = pickChallengeFromClientDataJSON(attestation);
      if (!extracted) {
        return NextResponse.json(
          { error: "challenge not found" },
          { status: 400 }
        );
      }
      ch = await consumeChallengeByValue("register", extracted);
    }

    if (!ch?.challenge) {
      return NextResponse.json({ error: "challenge not found" }, { status: 400 });
    }

    // 2) verifyRegistrationResponse
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

    // 3) publicKey を必ず Uint8Array として取り出す
    const picked = pickRegistrationKey(verification.registrationInfo);
    if (!picked?.publicKey?.length) {
      return NextResponse.json(
        { error: "public key missing" },
        { status: 400 }
      );
    }

    const credentialID = String(attestation.id ?? "");
    if (!isBase64url(credentialID)) {
      return NextResponse.json(
        { error: "invalid credential id" },
        { status: 400 }
      );
    }

    // ★★★ ここが決定打：.buffer を使わず “view範囲だけ” を保存する ★★★
    // Buffer.from(Uint8Array) は byteOffset/byteLength を尊重してくれる
    const pkBytes = Buffer.from(picked.publicKey);

    const { error: upsertErr } = await supabaseAdmin
      .from("admin_webauthn_credentials")
      .upsert(
        {
          admin_email: ADMIN_EMAIL,
          credential_id: credentialID,
          public_key: pkBytes,
          counter: picked.counter,
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
      { error: e?.message ?? "verify error" },
      { status: 500 }
    );
  }
}