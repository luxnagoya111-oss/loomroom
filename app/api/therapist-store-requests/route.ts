// app/api/therapist-store-requests/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getBearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function supabaseWithBearer(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}

// 申請一覧（店舗コンソール用）
// ※ これも Bearer 必須にするなら同様に bearer を読む
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId");
    if (!storeId) {
      return NextResponse.json({ ok: false, error: "storeId is required" }, { status: 400 });
    }

    const token = getBearer(req);
    if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const supabase = supabaseWithBearer(token);

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
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// 在籍申請作成（セラピスト側）
export async function POST(req: Request) {
  try {
    const token = getBearer(req);
    if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const storeId = body?.store_id as string | undefined;
    if (!storeId) {
      return NextResponse.json({ ok: false, error: "store_id is required" }, { status: 400 });
    }

    const supabase = supabaseWithBearer(token);

    // token で user 取れるかチェック（= auth.uid が有効）
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const { error } = await supabase.rpc("rpc_create_therapist_store_request", {
      p_store_id: storeId,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}