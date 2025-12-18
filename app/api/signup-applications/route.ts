// app/api/signup-applications/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // 念のためキャッシュ回避

const API_VERSION = "signup-applications@2025-12-18.v2";

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
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function isValidType(v: any): v is "store" | "therapist" | "user" {
  return v === "store" || v === "therapist" || v === "user";
}

function jsonNoStore(payload: any, init?: ResponseInit) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers || {}),
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    console.log("[signup-applications] HIT", API_VERSION);
    console.log("[signup-applications] auth exists =", !!authHeader);
    console.log(
      "[signup-applications] service key exists =",
      !!process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const token = pickBearerToken(req);
    if (!token) {
      return jsonNoStore(
        {
          ok: false,
          version: API_VERSION,
          error: "not authenticated",
          code: "P0001",
          details: "missing bearer token",
          hint: null,
        },
        { status: 401 }
      );
    }

    // token -> user（service roleで検証）
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    const user = userData?.user ?? null;

    if (userErr || !user) {
      return jsonNoStore(
        {
          ok: false,
          version: API_VERSION,
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
      return jsonNoStore(
        { ok: false, version: API_VERSION, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const typeRaw = body.type;
    const name = toText(body.name).trim();
    const contact = body.contact ?? null;
    const payload = body.payload ?? null;

    if (!isValidType(typeRaw) || !name) {
      return jsonNoStore(
        {
          ok: false,
          version: API_VERSION,
          error: "missing required fields",
          received: { type: !!typeRaw, name: !!name },
        },
        { status: 400 }
      );
    }

    const type = typeRaw;
    const applicant_user_id = user.id;

    const { data, error } = await supabaseAdmin
      .from("signup_applications")
      .insert({
        applicant_user_id,
        type,
        status: "pending",
        name,
        contact,
        payload,
      })
      .select("*")
      .single();

    if (error) {
      return jsonNoStore(
        {
          ok: false,
          version: API_VERSION,
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        },
        { status: 500 }
      );
    }

    if (type === "therapist") {
      const reviewedAt = safeNowIso();

      await supabaseAdmin.from("users").update({ role: "therapist" }).eq("id", applicant_user_id);

      const area = payload?.area ? toText(payload.area).trim() : "";
      const profileText =
        payload?.note?.trim?.()
          ? toText(payload.note).trim()
          : payload?.experience
          ? `経験/背景: ${toText(payload.experience).trim()}`
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

      return jsonNoStore({ ok: true, version: API_VERSION, data: updatedApp ?? data });
    }

    return jsonNoStore({ ok: true, version: API_VERSION, data });
  } catch (e: any) {
    return jsonNoStore(
      { ok: false, version: API_VERSION, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return jsonNoStore(
    { ok: false, version: API_VERSION, error: "Method Not Allowed" },
    { status: 405 }
  );
}