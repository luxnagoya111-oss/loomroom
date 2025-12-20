// app/api/admin/webauthn/login/verify/route.ts
import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";

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

/* =========================================================
 * bytea / Uint8Array を ArrayBuffer 固定 Uint8Array に変換
 * SharedArrayBuffer 完全排除版
 * ========================================================= */
function bufferToStrictUint8(buf: Buffer): Uint8Array<ArrayBuffer> {
  const ab = new ArrayBuffer(buf.length);
  const view = new Uint8Array(ab);
  view.set(buf);
  return view;
}

function normalizeBytea(v: any): Uint8Array<ArrayBuffer> {
  if (!v) return new Uint8Array(new ArrayBuffer(0));

  if (Buffer.isBuffer(v)) {
    return bufferToStrictUint8(v);
  }

  if (v instanceof Uint8Array) {
    return bufferToStrictUint8(Buffer.from(v));
  }

  if (typeof v === "string") {
    try {
      if (v.startsWith("\\x")) {
        return bufferToStrictUint8(Buffer.from(v.slice(2), "hex"));
      }
      return bufferToStrictUint8(Buffer.from(v, "base64"));
    } catch {
      return new Uint8Array(new ArrayBuffer(0));
    }
  }

  if (v?.type === "Buffer" && Array.isArray(v?.data)) {
    return bufferToStrictUint8(Buffer.from(v.data));
  }

  return new Uint8Array(new ArrayBuffer(0));
}

/* ========================================================= */

export async function POST(req: Request) {
  try {
    if (!ADMIN_EMAIL) {
      return NextResponse.json(
        { error: "ADMIN_EMAIL_ALLOWLIST is not configured" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const assertion: any = body?.assertion;
    const challengeId: string | undefined = body?.challengeId;
    const next: string | null = body?.next ?? null;

    if (!assertion || !challengeId) {
      return NextResponse.json(
        { error: "assertion/challengeId is required" },
        { status: 400 }
      );
    }

    if (!assertion.id || !assertion.response) {
      return NextResponse.json(
        { error: "invalid assertion payload" },
        { status: 400 }
      );
    }

    // 1) challenge 消費
    const ch = await consumeChallenge(String(challengeId));
    if (!ch || ch.purpose !== "login") {
      return NextResponse.json(
        { error: "challenge not found" },
        { status: 400 }
      );
    }

    // 2) credential 取得
    const credentialIdFromClient = String(assertion.id);

    const { data: cred, error } = await supabaseAdmin
      .from("admin_webauthn_credentials")
      .select("credential_id, public_key, counter")
      .eq("admin_email", ADMIN_EMAIL)
      .eq("credential_id", credentialIdFromClient)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!cred) {
      return NextResponse.json(
        { error: "credential not found" },
        { status: 400 }
      );
    }

    const publicKey = normalizeBytea(cred.public_key);
    if (!publicKey.length) {
      return NextResponse.json(
        { error: "invalid public_key" },
        { status: 500 }
      );
    }

    // ★ ここは string 固定（この版の型定義に合わせる）
    const credentialID = String(cred.credential_id);

    const counter =
      typeof cred.counter === "number" && Number.isFinite(cred.counter)
        ? cred.counter
        : 0;

    // 3) verify
    const verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: ch.challenge,
      expectedOrigin: ADMIN_ORIGIN,
      expectedRPID: ADMIN_RP_ID,

      credential: {
        id: credentialID,
        publicKey,
        counter,
      },

      requireUserVerification: false,
    });

    if (!verification.verified) {
      return NextResponse.json(
        { error: "authentication not verified" },
        { status: 401 }
      );
    }

    // 4) counter 更新
    const newCounter = verification.authenticationInfo.newCounter;

    await supabaseAdmin
      .from("admin_webauthn_credentials")
      .update({
        counter: newCounter,
        last_used_at: new Date().toISOString(),
      })
      .eq("admin_email", ADMIN_EMAIL)
      .eq("credential_id", cred.credential_id);

    // 5) admin session
    await createAdminSession(ADMIN_EMAIL);

    return NextResponse.json({
      ok: true,
      redirectTo: safeNext(next),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "verify error" },
      { status: 500 }
    );
  }
}