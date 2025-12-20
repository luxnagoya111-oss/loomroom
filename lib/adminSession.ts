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

export async function createAdminSession(adminEmail: string) {
  const id = crypto.randomUUID();
  const expiresAt = addDaysIso(ADMIN_SESSION_TTL_DAYS);

  const { error } = await supabaseAdmin.from("admin_sessions").insert([
    {
      id,
      admin_email: adminEmail,
      created_at: nowIso(),
      expires_at: expiresAt,
      step_up_at: nowIso(), // ログイン直後はstep-up済み扱いでも良い
    },
  ]);
  if (error) throw error;

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, id, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });

  return id;
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  const sid = cookieStore.get(ADMIN_SESSION_COOKIE)?.value ?? null;
  if (sid) {
    await supabaseAdmin.from("admin_sessions").delete().eq("id", sid);
  }
  cookieStore.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const sid = cookieStore.get(ADMIN_SESSION_COOKIE)?.value ?? null;
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