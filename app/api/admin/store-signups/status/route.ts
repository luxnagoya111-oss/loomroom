import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const { id, status } = await req.json();

    if (!id || !status) {
      return NextResponse.json(
        { error: "id and status are required" },
        { status: 400 }
      );
    }

    const patch: any = { status };
    if (status === "approved") patch.reviewed_at = new Date().toISOString();
    if (status === "rejected") patch.reviewed_at = new Date().toISOString();
    if (status === "pending") patch.reviewed_at = null;

    const { data, error } = await supabaseAdmin
      .from("signup_applications")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}