// app/api/admin/webauthn/register/options/route.ts
import { NextResponse } from "next/server";
import {
  generateRegistrationOptions,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";

import {
  ADMIN_EMAIL_ALLOWLIST,
  ADMIN_RP_ID,
  ADMIN_RP_NAME,
  ADMIN_ORIGIN,
} from "@/lib/adminConfig";
import { saveChallenge } from "../../_store";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = ADMIN_EMAIL_ALLOWLIST[0] || null;

function credentialIdToBase64url(id: any): string {
  if (!id) return "";

  // 既に base64url 文字列として保存しているならそのまま
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

export async function POST() {
  try {
    if (!ADMIN_EMAIL) {
      return NextResponse.json(
        { error: "ADMIN_EMAIL_ALLOWLIST is not configured" },
        { status: 400 }
      );
    }

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

    // ✅ generateRegistrationOptions の型定義に合わせる：
    // excludeCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[]
    const excludeCredentials = (creds ?? [])
      .map((c: any) => credentialIdToBase64url(c.credential_id))
      .filter(Boolean)
      .map((id) => ({
        id,
        transports,
      }));

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
      excludeCredentials,
    });

    // challenge は通常 string(base64url) で返るのでそのまま保存
    const challengeId = await saveChallenge("register", String(options.challenge));

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