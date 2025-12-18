// app/api/signup-applications/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ★重要：Edge だと auth.getUser(token) 周りが不安定になりやすいので Node 固定
export const runtime = "nodejs";

function toText(v: any): string {
  if (v == null) return "";
  return String(v);
}

function safeNowIso() {
  return new Date().toISOString();
}

/**
 * Authorization: Bearer <token> から token を抜く
 * - "Bearer" だけ（token空）や短すぎるtokenは null にする
 */
function pickBearerToken(req: NextRequest): { token: string | null; raw: string | null } {
  // NextRequest は小文字が基本。念のため両方見る
  const raw =
    req.headers.get("authorization") ??
    req.headers.get("Authorization");

  if (!raw) return { token: null, raw: null };

  // "Bearer xxx" の xxx 部分を抜く（xxx は1文字以上）
  const m = raw.match(/^Bearer\s+(.+)$/i);
  const extracted = m ? (m[1] ?? "").trim() : "";

  // token が空/短すぎる場合は無効扱い（JWT は通常かなり長い）
  if (!extracted || extracted.length < 30) {
    return { token: null, raw };
  }

  return { token: extracted, raw };
}

function isValidType(v: any): v is "store" | "therapist" | "user" {
  return v === "store" || v === "therapist" || v === "user";
}

export async function POST(req: NextRequest) {
  // ★ここで毎回ログを出す（トップレベルでは1回しか出ない）
  const hitAt = new Date().toISOString();

  try {
    // 0) ログ（Bearerが空かどうか即わかる）
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    console.log("[signup-applications] HIT", hitAt);
    console.log("[signup-applications] auth header len =", authHeader.length);
    // 中身は漏らさない（先頭だけ）
    console.log("[signup-applications] auth header head =", authHeader.slice(0, 40));

    // 1) Bearer 必須（cookie では認証しない）
    const { token, raw } = pickBearerToken(req);
    console.log("[signup-applications] bearer raw len =", raw?.length ?? 0);
    console.log("[signup-applications] bearer token len =", token?.length ?? 0);

    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error: "not authenticated",
          code: "P0001",
          details: "missing bearer token",
          hint: null,
        },
        { status: 401 }
      );
    }

    // 2) token -> user を確定（service role で検証）
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    const user = userData?.user ?? null;

    if (userErr || !user) {
      return NextResponse.json(
        {
          ok: false,
          error: "not authenticated",
          code: "P0001",
          details: userErr?.message ?? "user is null",
          hint: null,
        },
        { status: 401 }
      );
    }

    // 3) body
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const typeRaw = body.type;
    const name = toText(body.name).trim();
    const contact = body.contact ?? null;
    const payload = body.payload ?? null;

    if (!isValidType(typeRaw) || !name) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing required fields",
          received: { type: !!typeRaw, name: !!name },
        },
        { status: 400 }
      );
    }

    const type = typeRaw;
    const applicant_user_id = user.id; // ★必ず token 由来で確定

    // 4) signup_applications に保存（service role なので RLS はバイパスされる）
    const { data, error } = await supabaseAdmin
      .from("signup_applications")
      .insert({
        applicant_user_id,
        type,
        status: "pending",
        name,
        contact,
        payload,
      })
      .select("*")
      .single();

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

    // 5) therapist は自動承認 + therapists 作成 + users.role 更新
    if (type === "therapist") {
      const reviewedAt = safeNowIso();

      // role 更新
      await supabaseAdmin
        .from("users")
        .update({ role: "therapist" })
        .eq("id", applicant_user_id);

      const area = payload?.area ? toText(payload.area).trim() : "";
      const profileText =
        payload?.note?.trim?.()
          ? toText(payload.note).trim()
          : payload?.experience
          ? `経験/背景: ${toText(payload.experience).trim()}`
          : "";

      const { data: existing } = await supabaseAdmin
        .from("therapists")
        .select("id")
        .eq("user_id", applicant_user_id)
        .maybeSingle();

      if (existing?.id) {
        await supabaseAdmin
          .from("therapists")
          .update({
            display_name: name,
            area: area || null,
            profile: profileText || null,
          })
          .eq("id", existing.id);
      } else {
        await supabaseAdmin.from("therapists").insert({
          user_id: applicant_user_id,
          store_id: null,
          display_name: name,
          area: area || null,
          profile: profileText || null,
        });
      }

      const { data: updatedApp, error: updErr } = await supabaseAdmin
        .from("signup_applications")
        .update({ status: "approved", reviewed_at: reviewedAt })
        .eq("id", data.id)
        .select("*")
        .single();

      if (updErr) {
        // 申請作成はできているので、ここは500にせず、作成データを返す（運用を止めない）
        console.warn("[signup-applications] approve update failed:", updErr.message);
        return NextResponse.json({ ok: true, data });
      }

      return NextResponse.json({ ok: true, data: updatedApp ?? data });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error("[signup-applications] unhandled error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

// 明示（なくても動くが、事故防止）
export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Method Not Allowed" },
    { status: 405 }
  );
}