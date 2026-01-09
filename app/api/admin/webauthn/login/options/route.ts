// app/api/admin/webauthn/login/options/route.ts
import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import {
  ADMIN_EMAIL_ALLOWLIST,
  ADMIN_RP_ID,
  ADMIN_ORIGIN,
} from "@/lib/adminConfig";
import { saveChallenge } from "../../_store";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const ADMIN_EMAIL = ADMIN_EMAIL_ALLOWLIST[0] || null;

function credentialIdToString(id: any): string {
  if (!id) return "";
  if (typeof id === "string") return id;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(id)) return Buffer.from(id).toString("base64url");
  if (id instanceof Uint8Array) return Buffer.from(id).toString("base64url");
  return String(id);
}

function challengeToString(ch: any): string {
  if (typeof ch === "string") return ch;
  if (ch instanceof Uint8Array) return Buffer.from(ch).toString("base64url");
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(ch)) return Buffer.from(ch).toString("base64url");
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
    const next = body?.next ?? "/admin";

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

    const allowCredentials = (creds ?? [])
      .map((c: any) => credentialIdToString(c.credential_id))
      .filter(Boolean)
      .map((id) => ({ id, type: "public-key" } as any)); // ★型差分吸収

    const options = await generateAuthenticationOptions({
      rpID: ADMIN_RP_ID,
      timeout: 60000,
      userVerification: "preferred",
      allowCredentials,
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