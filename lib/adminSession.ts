// lib/adminSession.ts
import crypto from "crypto";
import { cookies } from "next/headers";
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

function cookieOptions(expiresAtIso?: string) {
  return {
    httpOnly: true as const,
    secure: true as const,
    sameSite: "lax" as const,
    path: "/",
    ...(expiresAtIso ? { expires: new Date(expiresAtIso) } : {}),
  };
}

const EXPIRED_ISO = "1970-01-01T00:00:00.000Z";

/**
 * ログイン成功 → 管理者セッションをDBに作成し、httpOnly cookie に sessionId を保存
 */
export async function createAdminSession(adminEmail: string) {
  const id = crypto.randomUUID();
  const expiresAt = addDaysIso(ADMIN_SESSION_TTL_DAYS);

  const { error } = await supabaseAdmin.from("admin_sessions").insert([
    {
      id,
      admin_email: adminEmail,
      created_at: nowIso(),
      expires_at: expiresAt,
      step_up_at: nowIso(), // ログイン直後は step-up 済み扱いでOK
    },
  ]);
  if (error) throw error;

  // ★ あなたの環境では cookies() が Promise 扱いなので await 必須
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, id, cookieOptions(expiresAt));

  return id;
}

/**
 * 明示ログアウト/セッション破棄
 */
export async function clearAdminSession() {
  const cookieStore = await cookies();
  const sid = cookieStore.get(ADMIN_SESSION_COOKIE)?.value ?? null;

  if (sid) {
    await supabaseAdmin.from("admin_sessions").delete().eq("id", sid);
  }

  cookieStore.set(ADMIN_SESSION_COOKIE, "", cookieOptions(EXPIRED_ISO));
}

/**
 * Cookie から sessionId を読み、DBの admin_sessions を参照して返す
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const sid = cookieStore.get(ADMIN_SESSION_COOKIE)?.value ?? null;
  if (!sid) return null;

  const { data, error } = await supabaseAdmin
    .from("admin_sessions")
    .select("*")
    .eq("id", sid)
    .maybeSingle();

  if (error || !data) {
    // DBに無いのに cookie だけ残っている場合の掃除
    cookieStore.set(ADMIN_SESSION_COOKIE, "", cookieOptions(EXPIRED_ISO));
    return null;
  }

  // 期限切れチェック
  const exp = new Date(data.expires_at).getTime();
  const now = Date.now();
  if (Number.isFinite(exp) && exp <= now) {
    // 期限切れは掃除（DB + cookie）
    await supabaseAdmin.from("admin_sessions").delete().eq("id", data.id);
    cookieStore.set(ADMIN_SESSION_COOKIE, "", cookieOptions(EXPIRED_ISO));
    return null;
  }

  return data as AdminSession;
}

/**
 * step-up が TTL 内か判定
 */
export function isStepUpRecent(stepUpAtIso: string | null): boolean {
  if (!stepUpAtIso) return false;
  const step = new Date(stepUpAtIso).getTime();
  if (!Number.isFinite(step)) return false;

  const ageMs = Date.now() - step;
  return ageMs <= ADMIN_STEPUP_TTL_MINUTES * 60 * 1000;
}

/**
 * step-up 実施時刻を更新
 */
export async function touchStepUp(sessionId: string) {
  const { error } = await supabaseAdmin
    .from("admin_sessions")
    .update({ step_up_at: nowIso() })
    .eq("id", sessionId);

  if (error) throw error;
}