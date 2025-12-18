// app/api/signup-applications/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const VERSION = "signup-applications@2025-12-18.v3";

function toText(v: any): string {
  if (v == null) return "";
  return String(v);
}
function safeNowIso() {
  return new Date().toISOString();
}

function pickBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;

  // 念のため余計な空白を許容
  const m = h.trim().match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function isValidType(v: any): v is "store" | "therapist" | "user" {
  return v === "store" || v === "therapist" || v === "user";
}

function hostFromUrl(u: string | undefined | null) {
  try {
    if (!u) return null;
    return new URL(u).host;
  } catch {
    return null;
  }
}

// JWT の payload をデコード（検証はしない）
function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    const json = Buffer.from(b64 + pad, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log(`[signup-applications] HIT ${VERSION}`);

    const token = pickBearerToken(req);
    console.log("[signup-applications] auth exists =", !!token);

    // supabaseAdmin.ts 側で env 不足なら throw されるが、
    // ここでも念のため “存在” だけはログ出し
    console.log("[signup-applications] service key exists =", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
    console.log("[signup-applications] project host =", hostFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL));

    if (!token) {
      return NextResponse.json(
        { ok: false, version: VERSION, error: "not authenticated", code: "P0001", details: "missing bearer token", hint: null },
        { status: 401 }
      );
    }

    const payload = decodeJwtPayload(token);
    const issHost = hostFromUrl(payload?.iss);
    console.log("[signup-applications] token iss host =", issHost);
    console.log("[signup-applications] token aud =", payload?.aud ?? null);
    console.log("[signup-applications] token sub =", payload?.sub ?? null);

    // ここがズレてたら “環境変数が別プロジェクト” で確定
    // （token の iss host と NEXT_PUBLIC_SUPABASE_URL の host が一致しているべき）
    // ただし念のため、この時点では即拒否せず getUser も試す

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    const user = userData?.user ?? null;

    console.log("[signup-applications] getUser error =", userErr?.message ?? null);
    console.log("[signup-applications] user is null =", !user);

    if (userErr || !user) {
      return NextResponse.json(
        {
          ok: false,
          version: VERSION,
          error: "not authenticated",
          code: "P0001",
          details: userErr?.message ?? "user is null",
          hint: null,
        },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, version: VERSION, error: "Invalid JSON body" }, { status: 400 });
    }

    const typeRaw = body.type;
    const name = toText(body.name).trim();
    const contact = body.contact ?? null;
    const appPayload = body.payload ?? null;

    if (!isValidType(typeRaw) || !name) {
      return NextResponse.json(
        { ok: false, version: VERSION, error: "missing required fields", received: { type: !!typeRaw, name: !!name } },
        { status: 400 }
      );
    }

    const type = typeRaw;
    const applicant_user_id = user.id; // token 由来で確定

    const { data, error } = await supabaseAdmin
      .from("signup_applications")
      .insert({
        applicant_user_id,
        type,
        status: "pending",
        name,
        contact,
        payload: appPayload,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, version: VERSION, error: error.message, code: error.code, details: error.details, hint: error.hint },
        { status: 500 }
      );
    }

    // therapist は自動承認
    if (type === "therapist") {
      const reviewedAt = safeNowIso();

      await supabaseAdmin.from("users").update({ role: "therapist" }).eq("id", applicant_user_id);

      const area = appPayload?.area ? toText(appPayload.area).trim() : "";
      const profileText =
        appPayload?.note?.trim?.()
          ? toText(appPayload.note).trim()
          : appPayload?.experience
          ? `経験/背景: ${toText(appPayload.experience).trim()}`
          : "";

      const { data: existing } = await supabaseAdmin
        .from("therapists")
        .select("id")
        .eq("user_id", applicant_user_id)
        .maybeSingle();

      if (existing?.id) {
        await supabaseAdmin
          .from("therapists")
          .update({
            display_name: name,
            area: area || null,
            profile: profileText || null,
          })
          .eq("id", existing.id);
      } else {
        await supabaseAdmin.from("therapists").insert({
          user_id: applicant_user_id,
          store_id: null,
          display_name: name,
          area: area || null,
          profile: profileText || null,
        });
      }

      const { data: updatedApp } = await supabaseAdmin
        .from("signup_applications")
        .update({ status: "approved", reviewed_at: reviewedAt })
        .eq("id", data.id)
        .select("*")
        .single();

      return NextResponse.json({ ok: true, version: VERSION, data: updatedApp ?? data });
    }

    return NextResponse.json({ ok: true, version: VERSION, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, version: VERSION, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, version: VERSION, error: "Method Not Allowed" }, { status: 405 });
}