import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createAdminSession } from "@/lib/adminSession";
import {
  ADMIN_EMAIL_ALLOWLIST,
  ADMIN_ORIGIN,
  ADMIN_RP_ID,
} from "@/lib/adminConfig";
import { consumeChallenge } from "../../_store";

export const runtime = "nodejs";

const ADMIN_EMAIL = ADMIN_EMAIL_ALLOWLIST[0] || null;

function safeNext(next: string | null) {
  if (!next) return "/admin";
  return next.startsWith("/") ? next : "/admin";
}

function toBase64urlString(input: any): string {
  if (!input) return "";
  if (typeof input === "string") return input;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(input)) {
    return Buffer.from(input).toString("base64url");
  }
  if (input instanceof Uint8Array) {
    return Buffer.from(input).toString("base64url");
  }
  return String(input);
}

function base64urlToUint8Array(s: string): Uint8Array {
  // Node runtime 前提
  return new Uint8Array(Buffer.from(s, "base64url"));
}

/**
 * Supabase の bytea が:
 * - Buffer
 * - Uint8Array
 * - "\\x...." の hex 文字列
 * - base64/base64url 文字列
 * のどれで返ってきても Uint8Array に揃える
 */
function byteaToUint8Array(v: any): Uint8Array {
  if (!v) return new Uint8Array();

  if (v instanceof Uint8Array) return v;

  if (typeof Buffer !== "undefined" && Buffer.isBuffer(v)) {
    return new Uint8Array(v);
  }

  if (typeof v === "string") {
    // Supabase bytea が "\\x..." で返るケース
    if (v.startsWith("\\x")) {
      const hex = v.slice(2);
      return Uint8Array.from(Buffer.from(hex, "hex"));
    }
    // base64url/base64 の可能性
    try {
      return Uint8Array.from(Buffer.from(v, "base64url"));
    } catch {
      try {
        return Uint8Array.from(Buffer.from(v, "base64"));
      } catch {
        return new Uint8Array();
      }
    }
  }

  return new Uint8Array();
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
    const assertion = body?.assertion;
    const next = safeNext(body?.next ?? null);
    const challengeId = body?.challengeId as string | undefined;

    if (!assertion) {
      return NextResponse.json(
        { error: "assertion is required" },
        { status: 400 }
      );
    }
    if (!challengeId) {
      return NextResponse.json(
        { error: "challengeId is required" },
        { status: 400 }
      );
    }

    // 1) challenge を取得
    const ch = await consumeChallenge(challengeId);
    if (!ch) {
      return NextResponse.json({ error: "challenge not found" }, { status: 400 });
    }
    if (ch.purpose !== "login") {
      return NextResponse.json(
        { error: "invalid challenge purpose" },
        { status: 400 }
      );
    }

    // 2) credential をDBから取得（照合キーは base64url 文字列）
    const credentialIdStr = toBase64urlString(assertion?.id);
    if (!credentialIdStr) {
      return NextResponse.json(
        { error: "assertion.id is missing" },
        { status: 400 }
      );
    }

    const { data: cred, error: credErr } = await supabaseAdmin
      .from("admin_webauthn_credentials")
      .select("credential_id, public_key, counter")
      .eq("admin_email", ADMIN_EMAIL)
      .eq("credential_id", credentialIdStr)
      .maybeSingle();

    if (credErr) {
      return NextResponse.json(
        { error: credErr.message || "failed to load credential" },
        { status: 500 }
      );
    }
    if (!cred) {
      return NextResponse.json(
        { error: "credential not found (register passkey first)" },
        { status: 400 }
      );
    }

    const credentialPublicKeyU8 = byteaToUint8Array(cred.public_key);
    const counter = Number.isFinite(cred.counter) ? Number(cred.counter) : 0;

    // ★ server verify に渡す credentialID は bytes (Uint8Array) が必要な版がある
    const credentialIdBytes = base64urlToUint8Array(credentialIdStr);

    // 3) verify：版差吸収（authenticator/credential 両方、idはbytesで渡す）
    const authLike = {
      // bytes
      credentialID: credentialIdBytes,
      credentialId: credentialIdBytes,
      id: credentialIdBytes,

      // public key bytes
      credentialPublicKey: credentialPublicKeyU8,
      publicKey: credentialPublicKeyU8,

      counter,
    };

    const verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: ch.challenge,
      expectedOrigin: ADMIN_ORIGIN,
      expectedRPID: ADMIN_RP_ID,

      // ★ ここがB1の正
      credential: {
        id: credentialIdStr,              // base64url string のまま
        publicKey: credentialPublicKeyU8, // Uint8Array（bytea→U8に変換済み）
        counter,                          // number
      },

      requireUserVerification: false,
    } as any);

    if (!verification?.verified) {
      return NextResponse.json({ error: "not verified" }, { status: 400 });
    }

    // counter 更新
    const newCounter =
      (verification as any)?.authenticationInfo?.newCounter ??
      (verification as any)?.authenticationInfo?.counter ??
      counter;

    await supabaseAdmin
      .from("admin_webauthn_credentials")
      .update({ counter: newCounter })
      .eq("admin_email", ADMIN_EMAIL)
      .eq("credential_id", credentialIdStr);

    // 4) admin session cookie 発行
    await createAdminSession(ADMIN_EMAIL);

    return NextResponse.json({ ok: true, redirectTo: next });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "verify error" },
      { status: 500 }
    );
  }
}