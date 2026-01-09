// app/api/therapist-store-requests/review/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";

type IncomingAction = "approve" | "reject" | "approved" | "rejected";

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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const requestId = body?.requestId as string | undefined;
    const action = body?.action as IncomingAction | undefined;

    if (!requestId || !action) {
      return NextResponse.json(
        { ok: false, error: "requestId and action are required" },
        { status: 400 }
      );
    }

    const normalized: "approved" | "rejected" | null =
      action === "approve" || action === "approved"
        ? "approved"
        : action === "reject" || action === "rejected"
        ? "rejected"
        : null;

    if (!normalized) {
      return NextResponse.json(
        { ok: false, error: "invalid action" },
        { status: 400 }
      );
    }

    // ★ Bearer があれば Bearer 優先、無ければ cookie セッション
    const bearer = getBearer(req);
    const supabase = bearer ? supabaseWithBearer(bearer) : await supabaseServer();

    // ★ 認証チェック（BearerならJWT、cookieならSSRセッション）
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const { error } = await supabase.rpc("rpc_review_therapist_store_request", {
      p_request_id: requestId,
      p_action: normalized,
    });

    if (error) {
      console.error("[API] review request rpc error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[API] review request exception:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}