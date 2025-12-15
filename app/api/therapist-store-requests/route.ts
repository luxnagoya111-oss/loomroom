import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

// 申請一覧（店舗コンソール用）
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId");

    if (!storeId) {
      return NextResponse.json(
        { ok: false, error: "storeId is required" },
        { status: 400 }
      );
    }

    const supabase = await supabaseServer();

    const { data, error } = await supabase
      .from("therapist_store_requests")
      .select(
        `
        id,
        store_id,
        therapist_id,
        status,
        created_at,
        therapist:therapists (
          id,
          display_name,
          area
        )
      `
      )
      .eq("store_id", storeId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[API] load requests error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error("[API] load requests exception:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

// 在籍申請作成（セラピスト側）
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const storeId = body?.store_id as string | undefined;

    if (!storeId) {
      return NextResponse.json(
        { ok: false, error: "store_id is required" },
        { status: 400 }
      );
    }

    const supabase = await supabaseServer();

    // RPC が "rpc_create_therapist_store_request" である前提（あなたの現状に合わせて）
    const { error } = await supabase.rpc("rpc_create_therapist_store_request", {
      p_store_id: storeId,
    });

    if (error) {
      console.error("[API] create request rpc error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[API] create request exception:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}