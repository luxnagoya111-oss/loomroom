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

  // cd が ArrayBuffer/Uint8Array の場合
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

async function consumeChallengeByValue(
  purpose: "register" | "login",
  challenge: string
) {
  // challenge 文字列でDB照会して消費（UIが challengeId を渡さない前提の救済）
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

export async function POST(req: Request) {
  try {
    if (!ADMIN_EMAIL) {
      return NextResponse.json(
        { error: "ADMIN_EMAIL_ALLOWLIST is not configured" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { attestation, challengeId } = body || {};
    if (!attestation) {
      return NextResponse.json(
        { error: "attestation is required" },
        { status: 400 }
      );
    }

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
          { error: "challenge not found (missing challengeId and cannot extract challenge)" },
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

    // @simplewebauthn/server の新しめの型：credential の中に入っている
    const credentialID = reg.credential.id;
    const credentialPublicKey = reg.credential.publicKey;
    const counter = reg.credential.counter;

    await supabaseAdmin.from("admin_webauthn_credentials").insert([
      {
        admin_email: ADMIN_EMAIL,
        credential_id: credentialID,
        public_key: credentialPublicKey,
        counter,
        created_at: new Date().toISOString(),
      },
    ]);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "verify error" },
      { status: 500 }
    );
  }
}