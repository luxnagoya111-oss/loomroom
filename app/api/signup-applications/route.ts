// app/api/signup-applications/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function toText(v: any): string {
  if (v == null) return "";
  return String(v);
}
function safeNowIso() {
  return new Date().toISOString();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const type = body.type as "store" | "therapist" | "user";
    const name = toText(body.name).trim();
    const contact = body.contact ?? null;
    const payload = body.payload ?? null;
    const applicant_user_id = toText(body.applicant_user_id);

    if (!type || !name || !applicant_user_id) {
      return NextResponse.json(
        { ok: false, error: "missing required fields", received: { type, name, applicant_user_id: !!applicant_user_id } },
        { status: 400 }
      );
    }

    // signup_applications に保存
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
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code, details: error.details, hint: error.hint },
        { status: 500 }
      );
    }

    // therapist は自動承認 + therapists 作成 + users.role 更新
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

      return NextResponse.json({ ok: true, data: updatedApp ?? data });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}