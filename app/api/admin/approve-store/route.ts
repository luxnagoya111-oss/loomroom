// app/api/admin/approve-store/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminKey } from "@/lib/adminGuard";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    // ★ 管理者チェック
    requireAdminKey(req);

    const body = await req.json().catch(() => null);
    const appId = body?.appId;

    if (!appId) {
      return NextResponse.json(
        { ok: false, error: "appId is required" },
        { status: 400 }
      );
    }

    // ★ 承認 RPC（service role）
    const { error: rpcErr } = await supabaseAdmin.rpc(
      "approve_store_signup",
      { p_app_id: appId }
    );

    if (rpcErr) {
      return NextResponse.json(
        { ok: false, error: rpcErr.message, code: rpcErr.code },
        { status: 500 }
      );
    }

    // 承認後のデータを返す
    const { data, error } = await supabaseAdmin
      .from("signup_applications")
      .select("*")
      .eq("id", appId)
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: e.status ?? 500 }
    );
  }
}
