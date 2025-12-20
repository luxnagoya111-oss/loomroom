// app/api/admin/webauthn/register/options/route.ts
import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import {
  ADMIN_EMAIL_ALLOWLIST,
  ADMIN_RP_ID,
  ADMIN_RP_NAME,
  ADMIN_ORIGIN,
} from "@/lib/adminConfig";
import { randomChallenge, saveChallenge } from "../../_store";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 登録を許可する管理者メール（最初は allowlist[0] を採用）
const ADMIN_EMAIL = ADMIN_EMAIL_ALLOWLIST[0] || null;

export async function POST() {
  try {
    if (!ADMIN_EMAIL) {
      return NextResponse.json(
        { error: "ADMIN_EMAIL_ALLOWLIST is not configured" },
        { status: 400 }
      );
    }

    // 既存credentialを取得してexclude
    const { data: creds, error } = await supabaseAdmin
      .from("admin_webauthn_credentials")
      .select("credential_id")
      .eq("admin_email", ADMIN_EMAIL);

    if (error) throw error;

    const challenge = randomChallenge();
    const challengeId = await saveChallenge("register", challenge);

    const options = await generateRegistrationOptions({
      rpName: ADMIN_RP_NAME,
      rpID: ADMIN_RP_ID,
      userID: new TextEncoder().encode(ADMIN_EMAIL),
      userName: ADMIN_EMAIL,
      attestationType: "none",
      timeout: 60000,
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
      excludeCredentials: (creds ?? []).map((c: any) => ({
        id: c.credential_id,
        type: "public-key",
      })),
      challenge,
    });

    // UI側が challengeId を送らない構成でも、返しておく（将来の拡張用）
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