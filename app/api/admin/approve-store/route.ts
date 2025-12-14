// app/api/admin/approve-store/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminKey } from "@/lib/adminGuard";

export async function POST(req: NextRequest) {
  try {
    requireAdminKey(req);

    const { appId } = await req.json();
    if (!appId) {
      return NextResponse.json({ error: "appId is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("approve_store_signup", {
      p_app_id: appId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    const status = e.status ?? 500;
    return NextResponse.json({ error: e.message }, { status });
  }
}