// app/api/therapist-store-requests/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";

function getBearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function supabaseWithBearer(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
  if (!anon) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing");

  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

type TherapistMini = {
  id: string;
  display_name: string | null;
  area: string | null;
};

function normalizeTherapist(t: any): TherapistMini | null {
  if (!t) return null;
  const one = Array.isArray(t) ? t[0] : t;
  if (!one) return null;
  return {
    id: String(one.id),
    display_name: (one.display_name ?? null) as string | null,
    area: (one.area ?? null) as string | null,
  };
}

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

    // ★ Bearer があれば Bearer を優先（将来の拡張も潰さない）
    // ★ 無ければ cookie セッション（supabaseServer）を使う
    const bearer = getBearer(req);
    const supabase = bearer ? supabaseWithBearer(bearer) : await supabaseServer();

    // 認証チェック
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }

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

    // ★ therapist が配列で返る場合があるので “単体に正規化”
    const normalized =
      (data ?? []).map((row: any) => ({
        id: String(row.id),
        store_id: String(row.store_id),
        therapist_id: String(row.therapist_id),
        status: String(row.status),
        created_at: String(row.created_at),
        therapist: normalizeTherapist(row.therapist),
      })) ?? [];

    return NextResponse.json({ ok: true, data: normalized });
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
    // ★ あなたの方針通り「Bearer 必須」
    const token = getBearer(req);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);
    const storeId = body?.store_id as string | undefined;

    if (!storeId) {
      return NextResponse.json(
        { ok: false, error: "store_id is required" },
        { status: 400 }
      );
    }

    const supabase = supabaseWithBearer(token);

    // token で user 取れるかチェック（= auth.uid が有効）
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user?.id) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }

    const { error } = await supabase.rpc("rpc_create_therapist_store_request", {
      p_store_id: storeId,
    });

    if (error) {
      // 申請重複などは 400 扱いでOK
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