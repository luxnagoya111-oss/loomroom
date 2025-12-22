// app/api/therapists/detach/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const therapistId = body.therapist_id as string | undefined;
    if (!therapistId) {
      return NextResponse.json(
        { ok: false, error: "therapist_id is required" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.rpc(
      "rpc_detach_therapist_from_store",
      { p_therapist_id: therapistId }
    );

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
