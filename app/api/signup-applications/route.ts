// app/api/signup-applications/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
const VERSION = "signup-applications@2025-12-18.v5";

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
  const m = h.trim().match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
function isValidType(v: any): v is "store" | "therapist" | "user" {
  return v === "store" || v === "therapist" || v === "user";
}

function fail(step: string, status: number, payload: any) {
  return NextResponse.json({ ok: false, version: VERSION, step, ...payload }, { status });
}

function userClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`, // ★これが重要（DB側の auth.uid() が生きる）
      },
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    console.log(`[signup-applications] HIT ${VERSION}`);

    // 1) Bearer 必須
    const token = pickBearerToken(req);
    if (!token) {
      return fail("auth", 401, {
        error: "not authenticated",
        code: "P0001",
        details: "missing bearer token",
        hint: null,
      });
    }

    // 2) token -> user を確定（service role で検証）
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    const user = userData?.user ?? null;

    if (userErr || !user) {
      return fail("auth", 401, {
        error: "not authenticated",
        code: "P0001",
        details: userErr?.message ?? "user is null",
        hint: null,
      });
    }

    // 3) body
    const body = await req.json().catch(() => null);
    if (!body) return fail("body", 400, { error: "Invalid JSON body" });

    const typeRaw = body.type;
    const name = toText(body.name).trim();
    const contact = body.contact ?? null;
    const payload = body.payload ?? null;

    if (!isValidType(typeRaw) || !name) {
      return fail("body", 400, {
        error: "missing required fields",
        received: { type: !!typeRaw, name: !!name },
      });
    }

    const type = typeRaw;
    const applicant_user_id = user.id; // token由来で確定

    // 4) signup_applications への insert は「ユーザーJWT」で実行（RLS/トリガー対策）
    const supabaseUser = userClient(token);

    const ins = await supabaseUser
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

    if (ins.error) {
      console.log("[signup-applications] insert error =", ins.error);
      return fail("insert_signup_applications", 500, {
        error: ins.error.message,
        code: ins.error.code,
        details: ins.error.details,
        hint: ins.error.hint,
      });
    }

    const appRow = ins.data;

    // 5) therapist は自動承認（ここは特権操作なので service role）
    if (type === "therapist") {
      const reviewedAt = safeNowIso();

      const u1 = await supabaseAdmin.from("users").update({ role: "therapist" }).eq("id", applicant_user_id);
      if (u1.error) {
        console.log("[signup-applications] users update error =", u1.error);
        return fail("therapist_auto_approve", 500, {
          error: u1.error.message,
          code: u1.error.code,
          details: u1.error.details,
          hint: u1.error.hint,
        });
      }

      const area = payload?.area ? toText(payload.area).trim() : "";
      const profileText =
        payload?.note?.trim?.()
          ? toText(payload.note).trim()
          : payload?.experience
          ? `経験/背景: ${toText(payload.experience).trim()}`
          : "";

      const ex = await supabaseAdmin.from("therapists").select("id").eq("user_id", applicant_user_id).maybeSingle();
      if (ex.error) {
        console.log("[signup-applications] therapists select error =", ex.error);
        return fail("therapist_auto_approve", 500, {
          error: ex.error.message,
          code: ex.error.code,
          details: ex.error.details,
          hint: ex.error.hint,
        });
      }

      if (ex.data?.id) {
        const up = await supabaseAdmin
          .from("therapists")
          .update({ display_name: name, area: area || null, profile: profileText || null })
          .eq("id", ex.data.id);
        if (up.error) {
          console.log("[signup-applications] therapists update error =", up.error);
          return fail("therapist_auto_approve", 500, {
            error: up.error.message,
            code: up.error.code,
            details: up.error.details,
            hint: up.error.hint,
          });
        }
      } else {
        const cr = await supabaseAdmin.from("therapists").insert({
          user_id: applicant_user_id,
          store_id: null,
          display_name: name,
          area: area || null,
          profile: profileText || null,
        });
        if (cr.error) {
          console.log("[signup-applications] therapists insert error =", cr.error);
          return fail("therapist_auto_approve", 500, {
            error: cr.error.message,
            code: cr.error.code,
            details: cr.error.details,
            hint: cr.error.hint,
          });
        }
      }

      const ap = await supabaseAdmin
        .from("signup_applications")
        .update({ status: "approved", reviewed_at: reviewedAt })
        .eq("id", appRow.id)
        .select("*")
        .single();

      if (ap.error) {
        console.log("[signup-applications] app approve update error =", ap.error);
        return fail("therapist_auto_approve", 500, {
          error: ap.error.message,
          code: ap.error.code,
          details: ap.error.details,
          hint: ap.error.hint,
        });
      }

      return NextResponse.json({ ok: true, version: VERSION, step: "done", data: ap.data });
    }

    return NextResponse.json({ ok: true, version: VERSION, step: "done", data: appRow });
  } catch (e: any) {
    console.log("[signup-applications] catch error =", e);
    return fail("catch", 500, { error: e?.message ?? "Unknown error" });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, version: VERSION, error: "Method Not Allowed" }, { status: 405 });
}