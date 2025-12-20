//app/admin/webauthn/register/verify/route.ts
import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { ADMIN_EMAIL_ALLOWLIST, ADMIN_RP_ID, ADMIN_ORIGIN } from "@/lib/adminConfig";
import { consumeChallenge } from "../../_store";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ADMIN_EMAIL = ADMIN_EMAIL_ALLOWLIST[0] || null;

export async function POST(req: Request) {
  try {
    if (!ADMIN_EMAIL) {
      return NextResponse.json({ error: "ADMIN_EMAIL_ALLOWLIST is not configured" }, { status: 400 });
    }

    const body = await req.json();
    const { attestation, challengeId } = body || {};
    if (!attestation || !challengeId) {
      return NextResponse.json({ error: "attestation/challengeId is required" }, { status: 400 });
    }

    const ch = await consumeChallenge(challengeId);
    if (!ch || ch.purpose !== "register") {
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
      return NextResponse.json({ error: "registration not verified" }, { status: 400 });
    }

    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

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
    return NextResponse.json({ error: e?.message || "verify error" }, { status: 500 });
  }
}