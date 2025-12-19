// app/api/admin/contact/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminKey } from "@/lib/requireAdminKey";

const ALLOWED_STATUS = ["new", "triaging", "waiting_user", "resolved", "closed"] as const;
const ALLOWED_PRIORITY = ["low", "normal", "high"] as const;

type AllowedStatus = (typeof ALLOWED_STATUS)[number];
type AllowedPriority = (typeof ALLOWED_PRIORITY)[number];

function toText(v: any): string {
  if (v == null) return "";
  return String(v);
}

export async function GET(req: NextRequest, ctx: { params: { id?: string } }) {
  try {
    const guard = requireAdminKey(req);
    if (!guard.ok) return guard.res;

    const id = toText(ctx?.params?.id).trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("contact_tickets")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[api/admin/contact/:id] get error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error("[api/admin/contact/:id] exception:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: { id?: string } }) {
  try {
    const guard = requireAdminKey(req);
    if (!guard.ok) return guard.res;

    const id = toText(ctx?.params?.id).trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }

    const payload = await req.json().catch(() => ({} as any));

    const rawStatus = toText(payload.status).trim();
    const rawPriority = toText(payload.priority).trim();

    const update: Partial<{ status: AllowedStatus; priority: AllowedPriority }> = {};

    if (rawStatus && (ALLOWED_STATUS as readonly string[]).includes(rawStatus)) {
      update.status = rawStatus as AllowedStatus;
    }
    if (rawPriority && (ALLOWED_PRIORITY as readonly string[]).includes(rawPriority)) {
      update.priority = rawPriority as AllowedPriority;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: false, error: "No updatable fields" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("contact_tickets")
      .update(update)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("[api/admin/contact/:id] patch error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error("[api/admin/contact/:id] patch exception:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown error" }, { status: 500 });
  }
}