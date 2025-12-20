import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createAdminSession } from "@/lib/adminSession";
import { ADMIN_EMAIL_ALLOWLIST, ADMIN_ORIGIN, ADMIN_RP_ID } from "@/lib/adminConfig";
import { consumeChallenge } from "../../_store";

export const runtime = "nodejs";

const ADMIN_EMAIL = ADMIN_EMAIL_ALLOWLIST[0] || null;

function safeNext(next: string | null) {
  if (!next) return "/admin";
  return next.startsWith("/") ? next : "/admin";
}

function toBase64url(input: any): string {
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

/**
 * Supabase の bytea が:
 * - Buffer
 * - Uint8Array
 * - "\\x...." の hex 文字列
 * のどれで返ってきても Uint8Array に揃える
 */
function byteaToUint8Array(v: any): Uint8Array {
  if (!v) return new Uint8Array();

  if (v instanceof Uint8Array) return v;

  if (typeof Buffer !== "undefined" && Buffer.isBuffer(v)) {
    return new Uint8Array(v);
  }

  if (typeof v === "string") {
    // \x + hex
    if (v.startsWith("\\x")) {
      const hex = v.slice(2);
      return Uint8Array.from(Buffer.from(hex, "hex"));
    }
    // base64url / base64 の可能性も吸収
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
      return NextResponse.json({ error: "assertion is required" }, { status: 400 });
    }
    if (!challengeId) {
      return NextResponse.json({ error: "challengeId is required" }, { status: 400 });
    }

    // 1) challenge を消費して取得
    const ch = await consumeChallenge(challengeId);
    if (!ch) {
      return NextResponse.json({ error: "challenge not found" }, { status: 400 });
    }
    if (ch.purpose !== "login") {
      return NextResponse.json({ error: "invalid challenge purpose" }, { status: 400 });
    }

    // 2) ブラウザが返す id（base64url string）で credential を引く
    const credentialId = toBase64url(assertion?.id);
    if (!credentialId) {
      return NextResponse.json({ error: "assertion.id is missing" }, { status: 400 });
    }

    const { data: cred, error: credErr } = await supabaseAdmin
      .from("admin_webauthn_credentials")
      .select("credential_id, public_key, counter")
      .eq("admin_email", ADMIN_EMAIL)
      .eq("credential_id", credentialId)
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

    // 3) public_key を Uint8Array に正規化（ここが今回の核心）
    const credentialPublicKey = byteaToUint8Array(cred.public_key);
    const counter = Number.isFinite(cred.counter) ? Number(cred.counter) : 0;

    // 4) verify（server パッケージの版差を吸収するため any キャストで固定）
    const verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: ch.challenge,
      expectedOrigin: ADMIN_ORIGIN,
      expectedRPID: ADMIN_RP_ID,

      // 版によって "authenticator" / "credential" が違うため、
      // ここは any で通し、実体は「id + publicKey + counter」で統一する
      authenticator: {
        credentialID: credentialId,
        credentialPublicKey,
        counter,
      },

      requireUserVerification: false,
    } as any);

    if (!verification.verified) {
      return NextResponse.json({ error: "not verified" }, { status: 400 });
    }

    // 5) counter 更新（あれば）
    const newCounter =
      (verification as any)?.authenticationInfo?.newCounter ??
      (verification as any)?.authenticationInfo?.counter ??
      counter;

    await supabaseAdmin
      .from("admin_webauthn_credentials")
      .update({ counter: newCounter })
      .eq("admin_email", ADMIN_EMAIL)
      .eq("credential_id", credentialId);

    // 6) admin session cookie 発行
    await createAdminSession(ADMIN_EMAIL);

    return NextResponse.json({ ok: true, redirectTo: next });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "verify error" }, { status: 500 });
  }
}