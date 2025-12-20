import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import {
  ADMIN_EMAIL_ALLOWLIST,
  ADMIN_RP_ID,
  ADMIN_RP_NAME,
  ADMIN_ORIGIN,
} from "@/lib/adminConfig";
import { saveChallenge } from "../../_store";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const ADMIN_EMAIL = ADMIN_EMAIL_ALLOWLIST[0] || null;

function credentialIdToBase64url(id: any): string {
  if (!id) return "";

  // 既にbase64url/文字列として保存しているならそのまま
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

    // ★ excludeCredentials は id:string(base64url) の配列にする（TS/ブラウザ互換）
    const excludeCredentials = (creds ?? [])
      .map((c: any) => credentialIdToBase64url(c.credential_id))
      .filter(Boolean)
      .map((id) => ({ id }));

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

    const challengeStr = challengeToString((options as any).challenge);
    const challengeId = await saveChallenge("register", challengeStr);

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