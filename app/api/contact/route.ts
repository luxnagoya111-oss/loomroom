// app/api/contact/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ContactCategory = "feedback" | "bug" | "signup" | "other";
type UserType = "guest" | "member" | "therapist" | "store" | "other";

function toText(v: any): string {
  if (v == null) return "";
  return String(v);
}

function normalizeEmail(v: any): string | null {
  const s = toText(v).trim();
  if (!s) return null;
  return s;
}

function pickDeviceHintFromUA(ua: string): string | null {
  const s = (ua || "").toLowerCase();
  if (!s) return null;
  if (s.includes("iphone") || s.includes("ipad") || s.includes("ios")) return "ios";
  if (s.includes("android")) return "android";
  if (s.includes("windows")) return "windows";
  if (s.includes("mac os") || s.includes("macintosh")) return "mac";
  return "other";
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    const userId = toText(payload.userId).trim();
    const name = toText(payload.name).trim();
    const userType = toText(payload.userType).trim() as UserType;
    const email = normalizeEmail(payload.email);
    const category = toText(payload.category).trim() as ContactCategory;
    const body = toText(payload.body).trim();

    const pageUrl = toText(payload.pageUrl).trim() || null;
    const ua = toText(payload.ua).trim() || req.headers.get("user-agent") || null;
    const deviceHint = pickDeviceHintFromUA(ua || "") || null;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "userId is required" },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json(
        { ok: false, error: "name is required" },
        { status: 400 }
      );
    }
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "body is required" },
        { status: 400 }
      );
    }

    const allowedCategory: ContactCategory[] = ["feedback", "bug", "signup", "other"];
    const allowedUserType: UserType[] = ["guest", "member", "therapist", "store", "other"];

    const safeCategory: ContactCategory = allowedCategory.includes(category)
      ? category
      : "other";
    const safeUserType: UserType = allowedUserType.includes(userType)
      ? userType
      : "other";

    const { data, error } = await supabaseAdmin
      .from("contact_tickets")
      .insert({
        status: "new",
        priority: safeCategory === "bug" || safeCategory === "signup" ? "high" : "normal",
        category: safeCategory,
        user_type: safeUserType,
        user_id: userId,
        name,
        email,
        body,
        page_url: pageUrl,
        ua,
        device_hint: deviceHint,
      })
      .select("id, created_at")
      .single();

    if (error) {
      console.error("[api/contact] insert error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, ticketId: data.id, createdAt: data.created_at });
  } catch (e: any) {
    console.error("[api/contact] exception:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}