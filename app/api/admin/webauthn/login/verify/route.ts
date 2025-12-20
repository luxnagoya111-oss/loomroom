// app/api/admin/webauthn/login/verify/route.ts
import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import {
  ADMIN_EMAIL_ALLOWLIST,
  ADMIN_ORIGIN,
  ADMIN_RP_ID,
} from "@/lib/adminConfig";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createAdminSession } from "@/lib/adminSession";
import { consumeChallenge } from "../../_store";

export const runtime = "nodejs";

const ADMIN_EMAIL = ADMIN_EMAIL_ALLOWLIST[0] || null;

function safeNext(next: string | null) {
  if (!next) return "/admin";
  return next.startsWith("/") ? next : "/admin";
}

/**
 * Supabaseのbytea(public_key)を、必ず Buffer に揃える
 * - "\\x...." (hex文字列)
 * - base64文字列
 * - Buffer / Uint8Array
 * のどれで来てもOK
 */
function normalizeByteaToBuffer(v: any): Buffer {
  if (!v) return Buffer.alloc(0);

  if (Buffer.isBuffer(v)) return v;

  if (v instanceof Uint8Array) return Buffer.from(v);

  if (typeof v === "string") {
    // Postgres bytea hex 表現
    if (v.startsWith("\\x")) {
      return Buffer.from(v.slice(2), "hex");
    }
    // PostgRESTがbase64で返すケース
    try {
      return Buffer.from(v, "base64");
    } catch {
      return Buffer.alloc(0);
    }
  }

  // まれに { type: 'Buffer', data: [...] } の形で来ることもある
  if (v?.type === "Buffer" && Array.isArray(v?.data)) {
    return Buffer.from(v.data);
  }

  return Buffer.alloc(0);
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
    const challengeId = body?.challengeId;
    const next = body?.next;

    if (!assertion || !challengeId) {
      return NextResponse.json(
        { error: "assertion/challengeId is required" },
        { status: 400 }
      );
    }

    // assertion の最低限チェック（欠けてると simplewebauthn が内部で落ちやすい）
    if (!assertion?.id || !assertion?.response) {
      return NextResponse.json(
        { error: "invalid assertion payload (missing id/response)" },
        { status: 400 }
      );
    }

    // 1) challenge 取得（DBから消費）
    const ch = await consumeChallenge(String(challengeId));
    if (!ch || ch.purpose !== "login") {
      return NextResponse.json(
        { error: "challenge not found" },
        { status: 400 }
      );
    }

    // 2) credential を特定（DBのキーは base64url string のまま照合）
    const credentialIdStr: string = String(assertion.id);
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
        { error: "credential not found" },
        { status: 400 }
      );
    }

    // ★今回の核心：public_key(bytea) を必ず Buffer にする
    const publicKeyBuf = normalizeByteaToBuffer(cred.public_key);
    if (!publicKeyBuf.length) {
      return NextResponse.json(
        { error: "public_key is empty or invalid (bytea decode failed)" },
        { status: 500 }
      );
    }

    // ★credentialID は raw bytes を要求する版があるため Buffer に
    //   DBには base64url string を保存している前提
    const credentialIdBuf = isoBase64URL.toBuffer(String(cred.credential_id));

    const counter = Number.isFinite(cred.counter) ? Number(cred.counter) : 0;

    const verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: ch.challenge,
      expectedOrigin: ADMIN_ORIGIN,
      expectedRPID: ADMIN_RP_ID,

      // 版差はあるが、実運用で落ちない構造に固定（anyで通す）
      authenticator: {
        credentialID: credentialIdBuf, // raw bytes
        credentialPublicKey: publicKeyBuf, // COSE key bytes
        counter,
      },

      requireUserVerification: false,
    } as any);

    if (!verification?.verified) {
      return NextResponse.json(
        { error: "authentication not verified" },
        { status: 401 }
      );
    }

    // counter 更新
    const newCounter =
      (verification as any)?.authenticationInfo?.newCounter ??
      (verification as any)?.authenticationInfo?.counter ??
      counter;

    await supabaseAdmin
      .from("admin_webauthn_credentials")
      .update({
        counter: newCounter,
        last_used_at: new Date().toISOString(),
      })
      .eq("admin_email", ADMIN_EMAIL)
      .eq("credential_id", String(cred.credential_id));

    // admin session cookie 発行
    await createAdminSession(ADMIN_EMAIL);

    return NextResponse.json({ ok: true, redirectTo: safeNext(next ?? null) });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "verify error" },
      { status: 500 }
    );
  }
}