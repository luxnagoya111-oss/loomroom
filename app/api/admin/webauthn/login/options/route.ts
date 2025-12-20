// app/api/admin/webauthn/login/options/route.ts
import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import {
  ADMIN_EMAIL_ALLOWLIST,
  ADMIN_RP_ID,
  ADMIN_ORIGIN,
} from "@/lib/adminConfig";
import { randomChallenge, saveChallenge } from "../../_store";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = ADMIN_EMAIL_ALLOWLIST[0] || null;

export async function POST() {
  try {
    if (!ADMIN_EMAIL) {
      return NextResponse.json(
        { error: "ADMIN_EMAIL_ALLOWLIST is not configured" },
        { status: 400 }
      );
    }

    const { data: creds, error } = await supabaseAdmin
      .from("admin_webauthn_credentials")
      .select("credential_id")
      .eq("admin_email", ADMIN_EMAIL);

    if (error) throw error;
    if (!creds || creds.length === 0) {
      return NextResponse.json(
        { error: "No passkey registered yet" },
        { status: 400 }
      );
    }

    const challenge = randomChallenge();
    const challengeId = await saveChallenge("login", challenge);

    const options = await generateAuthenticationOptions({
      rpID: ADMIN_RP_ID,
      timeout: 60000,
      userVerification: "preferred",
      allowCredentials: creds.map((c: any) => ({
        id: c.credential_id,
        type: "public-key",
      })),
      challenge,
    });

    return NextResponse.json({
      options,
      challengeId,
      rp: { id: ADMIN_RP_ID, origin: ADMIN_ORIGIN },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "options error" },
      { status: 500 }
    );
  }
}