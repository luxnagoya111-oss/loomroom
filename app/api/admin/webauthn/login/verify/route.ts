//app/admin/webauthn/login/verify/route.ts
import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { ADMIN_EMAIL_ALLOWLIST, ADMIN_ORIGIN, ADMIN_RP_ID } from "@/lib/adminConfig";
import { consumeChallenge } from "../../_store";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createAdminSession } from "@/lib/adminSession";

const ADMIN_EMAIL = ADMIN_EMAIL_ALLOWLIST[0] || null;

function safeNext(next: string | null) {
  if (!next) return "/admin";
  return next.startsWith("/") ? next : "/admin";
}

export async function POST(req: Request) {
  try {
    if (!ADMIN_EMAIL) {
      return NextResponse.json({ error: "ADMIN_EMAIL_ALLOWLIST is not configured" }, { status: 400 });
    }

    const body = await req.json();
    const { assertion, challengeId, next } = body || {};
    if (!assertion || !challengeId) {
      return NextResponse.json({ error: "assertion/challengeId is required" }, { status: 400 });
    }

    const ch = await consumeChallenge(challengeId);
    if (!ch || ch.purpose !== "login") {
      return NextResponse.json({ error: "challenge not found" }, { status: 400 });
    }

    // credential を特定
    const credentialID = assertion?.id;
    const { data: cred } = await supabaseAdmin
      .from("admin_webauthn_credentials")
      .select("*")
      .eq("admin_email", ADMIN_EMAIL)
      .eq("credential_id", credentialID)
      .maybeSingle();

    if (!cred) {
      return NextResponse.json({ error: "credential not found" }, { status: 400 });
    }

    const verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: ch.challenge,
      expectedOrigin: ADMIN_ORIGIN,
      expectedRPID: ADMIN_RP_ID,
      authenticator: {
        credentialID: cred.credential_id,
        credentialPublicKey: cred.public_key,
        counter: cred.counter ?? 0,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      return NextResponse.json({ error: "authentication not verified" }, { status: 401 });
    }

    // counter更新
    const newCounter = verification.authenticationInfo?.newCounter ?? cred.counter ?? 0;
    await supabaseAdmin
      .from("admin_webauthn_credentials")
      .update({ counter: newCounter, last_used_at: new Date().toISOString() })
      .eq("admin_email", ADMIN_EMAIL)
      .eq("credential_id", cred.credential_id);

    // admin session 作成（cookie発行）
    await createAdminSession(ADMIN_EMAIL);

    return NextResponse.json({ ok: true, redirectTo: safeNext(next ?? null) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "verify error" }, { status: 500 });
  }
}