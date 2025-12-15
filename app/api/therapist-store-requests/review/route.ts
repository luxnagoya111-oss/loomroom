import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type IncomingAction = "approve" | "reject" | "approved" | "rejected";

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

    // ★ RPC が期待する値に揃える（ここが本質）
    // あなたのRPCは多分 "approved"/"rejected" 期待
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

    const supabase = await supabaseServer();

    const { error } = await supabase.rpc("rpc_review_therapist_store_request", {
      p_request_id: requestId,
      p_action: normalized, // ★ "approved" | "rejected"
    });

    if (error) {
      console.error("[API] review request rpc error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
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