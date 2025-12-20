// app/api/admin/webauthn/login/verify/route.ts
import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import {
  ADMIN_EMAIL_ALLOWLIST,
  ADMIN_ORIGIN,
  ADMIN_RP_ID,
} from "@/lib/adminConfig";
import { consumeChallenge } from "../../_store";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createAdminSession } from "@/lib/adminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = ADMIN_EMAIL_ALLOWLIST[0] || null;

function safeNext(next: string | null) {
  if (!next) return "/admin";
  return next.startsWith("/") ? next : "/admin";
}

function base64urlToUtf8(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  return Buffer.from(b64 + pad, "base64").toString("utf8");
}

function pickChallengeFromClientDataJSON(assertion: any): string | null {
  const cd = assertion?.response?.clientDataJSON;
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

export async function POST(req: Request) {
  try {
    if (!ADMIN_EMAIL) {
      return NextResponse.json(
        { error: "ADMIN_EMAIL_ALLOWLIST is not configured" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { assertion, challengeId, next } = body || {};
    if (!assertion) {
      return NextResponse.json(
        { error: "assertion is required" },
        { status: 400 }
      );
    }

    // 1) challenge を取得（challengeId 優先、無ければ clientDataJSON から抽出して照会）
    let ch: any = null;

    if (challengeId) {
      ch = await consumeChallenge(challengeId);
      if (ch && ch.purpose !== "login") ch = null;
    }

    if (!ch) {
      const extracted = pickChallengeFromClientDataJSON(assertion);
      if (!extracted) {
        return NextResponse.json(
          { error: "challenge not found (missing challengeId and cannot extract challenge)" },
          { status: 400 }
        );
      }
      ch = await consumeChallengeByValue("login", extracted);
    }

    if (!ch) {
      return NextResponse.json({ error: "challenge not found" }, { status: 400 });
    }

    // credential を特定
    const credentialID = assertion?.id;
    const { data: cred, error: credErr } = await supabaseAdmin
      .from("admin_webauthn_credentials")
      .select("*")
      .eq("admin_email", ADMIN_EMAIL)
      .eq("credential_id", credentialID)
      .maybeSingle();

    if (credErr) throw credErr;

    if (!cred) {
      return NextResponse.json({ error: "credential not found" }, { status: 400 });
    }

    const verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: ch.challenge,
      expectedOrigin: ADMIN_ORIGIN,
      expectedRPID: ADMIN_RP_ID,
      credential: {
        id: cred.credential_id,
        publicKey: cred.public_key,
        counter: cred.counter ?? 0,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      return NextResponse.json(
        { error: "authentication not verified" },
        { status: 401 }
      );
    }

    // counter更新
    const newCounter =
      verification.authenticationInfo?.newCounter ?? cred.counter ?? 0;

    await supabaseAdmin
      .from("admin_webauthn_credentials")
      .update({ counter: newCounter, last_used_at: new Date().toISOString() })
      .eq("admin_email", ADMIN_EMAIL)
      .eq("credential_id", cred.credential_id);

    // admin session 作成（cookie発行）
    await createAdminSession(ADMIN_EMAIL);

    return NextResponse.json({ ok: true, redirectTo: safeNext(next ?? null) });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "verify error" },
      { status: 500 }
    );
  }
}