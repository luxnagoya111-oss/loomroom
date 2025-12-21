// app/api/admin/webauthn/login/verify/route.ts
import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";

import {
  ADMIN_EMAIL_ALLOWLIST,
  ADMIN_ORIGIN,
  ADMIN_RP_ID,
} from "@/lib/adminConfig";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { consumeChallenge } from "../../_store";
import { createAdminSession, applyAdminSessionCookie } from "@/lib/adminSession";

export const runtime = "nodejs";

const ADMIN_EMAIL = ADMIN_EMAIL_ALLOWLIST[0] || null;

function safeNext(next: string | null) {
  if (!next) return "/admin";
  return next.startsWith("/") ? next : "/admin";
}

/* =========================================================
 * DB bytea -> Uint8Array<ArrayBuffer固定)
 * public_key は @simplewebauthn/server が Uint8Array を期待
 * ========================================================= */
function bufferToStrictUint8(buf: Buffer): Uint8Array<ArrayBuffer> {
  const ab = new ArrayBuffer(buf.length);
  const view = new Uint8Array(ab);
  view.set(buf);
  return view;
}

function normalizeBytea(v: any): Uint8Array<ArrayBuffer> {
  if (!v) return new Uint8Array(new ArrayBuffer(0));

  if (Buffer.isBuffer(v)) return bufferToStrictUint8(v);

  if (v instanceof Uint8Array) return bufferToStrictUint8(Buffer.from(v));

  if (typeof v === "string") {
    try {
      if (v.startsWith("\\x")) {
        return bufferToStrictUint8(Buffer.from(v.slice(2), "hex"));
      }
      // base64 / base64url 両対応
      const s = v.replace(/-/g, "+").replace(/_/g, "/");
      const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
      return bufferToStrictUint8(Buffer.from(s + pad, "base64"));
    } catch {
      return new Uint8Array(new ArrayBuffer(0));
    }
  }

  if (v?.type === "Buffer" && Array.isArray(v?.data)) {
    return bufferToStrictUint8(Buffer.from(v.data));
  }

  return new Uint8Array(new ArrayBuffer(0));
}

/* =========================================================
 * assertion は「加工しない」(最重要)
 * - startAuthentication() が返した JSON をそのまま verify へ渡す
 * - ここで触ると decode が壊れて “Length not supported...” が出やすい
 * ========================================================= */
function isNonEmptyString(v: any): v is string {
  return typeof v === "string" && v.length > 0;
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
    const assertion: any = body?.assertion; // ★加工しない
    const challengeId: string | undefined = body?.challengeId;
    const next: string | null = body?.next ?? null;

    if (!assertion || !challengeId) {
      return NextResponse.json(
        { error: "assertion/challengeId is required" },
        { status: 400 }
      );
    }

    // 0) 最低限の形だけチェック（decode/変換はしない）
    if (
      !isNonEmptyString(assertion?.id) ||
      !isNonEmptyString(assertion?.rawId) ||
      !isNonEmptyString(assertion?.type) ||
      !isNonEmptyString(assertion?.response?.clientDataJSON) ||
      !isNonEmptyString(assertion?.response?.authenticatorData) ||
      !isNonEmptyString(assertion?.response?.signature)
    ) {
      return NextResponse.json(
        {
          error: "invalid assertion payload (non-string field detected)",
          hint: "Do not transform assertion; send the object returned by startAuthentication() as-is.",
        },
        { status: 400 }
      );
    }

    // 1) challenge 消費
    const ch = await consumeChallenge(String(challengeId));
    if (!ch || ch.purpose !== "login") {
      return NextResponse.json({ error: "challenge not found" }, { status: 400 });
    }

    if (!isNonEmptyString(ch.challenge)) {
      return NextResponse.json(
        { error: "stored challenge is invalid" },
        { status: 500 }
      );
    }

    // 2) credential 取得（登録した id 文字列と一致する想定）
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
        {
          error: "credential not found (id mismatch)",
          hint: "If you recently changed how credential_id is stored, clear old rows and re-register once.",
        },
        { status: 400 }
      );
    }

    const publicKey = normalizeBytea(cred.public_key);
    if (!publicKey.length) {
      return NextResponse.json({ error: "invalid public_key" }, { status: 500 });
    }

    const credentialID = String(cred.credential_id);
    const counter =
      typeof cred.counter === "number" && Number.isFinite(cred.counter)
        ? cred.counter
        : 0;

    // 3) verify（ここで “Length not supported...” が出るなら assertion の中身が壊れてる）
    let verification: any;
    try {
      verification = await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: ch.challenge, // ★ string のまま
        expectedOrigin: ADMIN_ORIGIN,
        expectedRPID: ADMIN_RP_ID,
        credential: {
          id: credentialID,
          publicKey,
          counter,
        },
        requireUserVerification: false,
      });
    } catch (e: any) {
      return NextResponse.json(
        {
          error: e?.message || "verifyAuthenticationResponse threw",
          hint:
            "This almost always means one of clientDataJSON/authenticatorData/signature is not valid base64url. Ensure LoginClient uses startAuthentication({ optionsJSON }) and sends the returned assertion without any modifications.",
        },
        { status: 500 }
      );
    }

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

    // 5) admin session（DBに作成）
    const { sessionId, expiresAt } = await createAdminSession(ADMIN_EMAIL);

    // ★ Cookie set は NextResponse 側で行う（next/headers cookies().set は世代差がある）
    const res = NextResponse.json({
      ok: true,
      redirectTo: safeNext(next),
    });
    applyAdminSessionCookie(res, sessionId, expiresAt);
    return res;
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "verify error" },
      { status: 500 }
    );
  }
}