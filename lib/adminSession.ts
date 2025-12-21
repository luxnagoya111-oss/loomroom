// lib/adminSession.ts
import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_DAYS,
  ADMIN_STEPUP_TTL_MINUTES,
} from "@/lib/adminConfig";

export type AdminSession = {
  id: string;
  admin_email: string;
  created_at: string;
  expires_at: string;
  step_up_at: string | null;
};

function nowIso() {
  return new Date().toISOString();
}
function addDaysIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * DB に admin session を作成して返す（Cookie は触らない）
 */
export async function createAdminSession(adminEmail: string): Promise<{
  sessionId: string;
  expiresAt: string;
}> {
  const sessionId = crypto.randomUUID();
  const expiresAt = addDaysIso(ADMIN_SESSION_TTL_DAYS);

  const { error } = await supabaseAdmin.from("admin_sessions").insert([
    {
      id: sessionId,
      admin_email: adminEmail,
      created_at: nowIso(),
      expires_at: expiresAt,
      step_up_at: nowIso(), // ログイン直後は step-up 済み扱い
    },
  ]);
  if (error) throw error;

  return { sessionId, expiresAt };
}

/**
 * Route Handler 側で cookie を set するためのヘルパー
 */
export function applyAdminSessionCookie(
  res: NextResponse,
  sessionId: string,
  expiresAtIso: string
) {
  res.cookies.set(ADMIN_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAtIso),
  });
}

/**
 * Route Handler 側で cookie を消すためのヘルパー
 */
export function clearAdminSessionCookie(res: NextResponse) {
  res.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}

/**
 * いま付いている cookie を見て DB セッションを読む（read-only）
 * Next の世代差を吸収するため cookies() は await して安全側に寄せる
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore: any = await cookies();
  const sid: string | null = cookieStore?.get?.(ADMIN_SESSION_COOKIE)?.value ?? null;
  if (!sid) return null;

  const { data, error } = await supabaseAdmin
    .from("admin_sessions")
    .select("*")
    .eq("id", sid)
    .maybeSingle();

  if (error) return null;
  if (!data) return null;

  // 期限切れ
  const now = Date.now();
  const exp = new Date(data.expires_at).getTime();
  if (Number.isFinite(exp) && exp <= now) return null;

  return data as any;
}

export function isStepUpRecent(stepUpAtIso: string | null): boolean {
  if (!stepUpAtIso) return false;
  const step = new Date(stepUpAtIso).getTime();
  if (!Number.isFinite(step)) return false;
  const ageMs = Date.now() - step;
  return ageMs <= ADMIN_STEPUP_TTL_MINUTES * 60 * 1000;
}

export async function touchStepUp(sessionId: string) {
  const { error } = await supabaseAdmin
    .from("admin_sessions")
    .update({ step_up_at: nowIso() })
    .eq("id", sessionId);
  if (error) throw error;
}

/**
 * DB + cookie を消す場合は Route Handler で：
 * - DB削除
 * - clearAdminSessionCookie(res)
 * の順で行うのが安全
 */
export async function deleteAdminSession(sessionId: string) {
  await supabaseAdmin.from("admin_sessions").delete().eq("id", sessionId);
}