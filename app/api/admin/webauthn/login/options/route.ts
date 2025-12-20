// app/api/admin/webauthn/login/options/route.ts
import { NextResponse } from "next/server";
import {
  generateAuthenticationOptions,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";

import {
  ADMIN_EMAIL_ALLOWLIST,
  ADMIN_RP_ID,
  ADMIN_ORIGIN,
} from "@/lib/adminConfig";
import { saveChallenge } from "../../_store";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = ADMIN_EMAIL_ALLOWLIST[0] || null;

function safeNext(next: any) {
  const s = typeof next === "string" ? next : "/admin";
  return s.startsWith("/") ? s : "/admin";
}

function credentialIdToBase64url(id: any): string {
  if (!id) return "";

  // 既に base64url/文字列として保存しているならそのまま
  if (typeof id === "string") return id;

  // Buffer(bytea)
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(id)) {
    return Buffer.from(id).toString("base64url");
  }

  // Uint8Array
  if (id instanceof Uint8Array) {
    return Buffer.from(id).toString("base64url");
  }

  // それ以外は最後に文字列化
  return String(id);
}

function challengeToString(ch: any): string {
  if (typeof ch === "string") return ch;
  if (ch instanceof Uint8Array) return Buffer.from(ch).toString("base64url");
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(ch)) {
    return Buffer.from(ch).toString("base64url");
  }
  return String(ch ?? "");
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
    const next = safeNext(body?.next);

    const { data: creds, error: credsErr } = await supabaseAdmin
      .from("admin_webauthn_credentials")
      .select("credential_id")
      .eq("admin_email", ADMIN_EMAIL);

    if (credsErr) {
      return NextResponse.json(
        { error: credsErr.message || "failed to load credentials" },
        { status: 500 }
      );
    }

    // ✅ 型に合わせて transports を定義（string[] ではなく union 配列）
    const transports: AuthenticatorTransportFuture[] = [
      "internal",
      "hybrid",
      "usb",
      "ble",
      "nfc",
    ];

    // ✅ allowCredentials は { id, type, transports } 形式にする
    //    （ブラウザ側が互換モードに落ちるのを防ぐ）
    const allowCredentials = (creds ?? [])
      .map((c: any) => credentialIdToBase64url(c.credential_id))
      .filter(Boolean)
      .map((id) => ({
        id,
        type: "public-key" as const,
        transports,
      }));

    const options = await generateAuthenticationOptions({
      rpID: ADMIN_RP_ID,
      timeout: 60000,
      userVerification: "preferred",
      ...(allowCredentials.length ? { allowCredentials } : {}),
    });

    const challengeStr = challengeToString((options as any).challenge);
    const challengeId = await saveChallenge("login", challengeStr);

    return NextResponse.json({
      options,
      challengeId,
      next,
      rp: { id: ADMIN_RP_ID, origin: ADMIN_ORIGIN },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "options error" },
      { status: 500 }
    );
  }
}