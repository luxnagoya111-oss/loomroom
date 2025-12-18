// app/api/signup-applications/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * 安全な文字列化
 */
function toText(v: any): string {
  if (v == null) return "";
  return String(v);
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Authorization ヘッダからユーザーを確定
 * ※ applicant_user_id を body から受け取らない
 */
async function requireAuthUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) throw new Error("Missing Authorization header");

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data?.user) {
    throw new Error("Invalid or expired session");
  }

  return data.user;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser(req);

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const type = body.type as "store" | "therapist";
    const name = toText(body.name).trim();
    const contact = body.contact ? toText(body.contact).trim() : null;
    const payload = body.payload ?? {};

    if (!type || !name) {
      return NextResponse.json(
        { ok: false, error: "missing required fields" },
        { status: 400 }
      );
    }

    // ---- signup_applications に保存（service role）----
    const { data: app, error: insertError } = await supabaseAdmin
      .from("signup_applications")
      .insert({
        applicant_user_id: user.id,
        type,
        status: "pending",
        name,
        contact,
        payload,
      })
      .select("*")
      .single();

    if (insertError || !app) {
      return NextResponse.json(
        {
          ok: false,
          error: insertError?.message ?? "insert failed",
          code: insertError?.code,
        },
        { status: 500 }
      );
    }

    // ---- therapist は自動承認 ----
    if (type === "therapist") {
      const reviewedAt = nowIso();

      // users.role 更新
      await supabaseAdmin
        .from("users")
        .update({ role: "therapist" })
        .eq("id", user.id);

      const area = payload.area ? toText(payload.area).trim() : null;
      const profile =
        payload.note?.trim?.() ||
        payload.experience?.trim?.() ||
        null;

      const { data: existing } = await supabaseAdmin
        .from("therapists")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing?.id) {
        await supabaseAdmin
          .from("therapists")
          .update({
            display_name: name,
            area,
            profile,
          })
          .eq("id", existing.id);
      } else {
        await supabaseAdmin.from("therapists").insert({
          user_id: user.id,
          store_id: null,
          display_name: name,
          area,
          profile,
        });
      }

      const { data: updated } = await supabaseAdmin
        .from("signup_applications")
        .update({
          status: "approved",
          reviewed_at: reviewedAt,
        })
        .eq("id", app.id)
        .select("*")
        .single();

      return NextResponse.json({ ok: true, data: updated ?? app });
    }

    // ---- store は pending のまま ----
    return NextResponse.json({ ok: true, data: app });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message ?? "Unknown error" },
      { status: 401 }
    );
  }
}