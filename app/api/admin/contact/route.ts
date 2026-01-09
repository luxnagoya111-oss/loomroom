// app/api/admin/contact/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminKey } from "@/lib/requireAdminKey";

export async function GET(req: NextRequest) {
  try {
    const guard = requireAdminKey(req);
    if (!guard.ok) return guard.res;

    const url = new URL(req.url);
    const status = url.searchParams.get("status"); // optional
    const q = (url.searchParams.get("q") || "").trim(); // optional
    const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 200);

    let query = supabaseAdmin
      .from("contact_tickets")
      .select(
        "id, created_at, status, priority, category, user_type, user_id, name, email, body, page_url"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (
      status &&
      ["new", "triaging", "waiting_user", "resolved", "closed"].includes(status)
    ) {
      query = query.eq("status", status);
    }

    // 簡易検索（ilike）
    if (q) {
      const pattern = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
      query = query.or(
        [
          `user_id.ilike.${pattern}`,
          `name.ilike.${pattern}`,
          `email.ilike.${pattern}`,
          `body.ilike.${pattern}`,
        ].join(",")
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error("[api/admin/contact] list error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    console.error("[api/admin/contact] exception:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}