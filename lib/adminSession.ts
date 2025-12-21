// lib/adminSession.ts
import crypto from "crypto";
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
 * セッションを作る（Cookieは触らない）
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
      step_up_at: nowIso(),
    },
  ]);

  if (error) throw error;

  return { sessionId, expiresAt };
}

/**
 * Route Handler 用：NextResponse に cookie を付与
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
 * step-up 判定用（cookie操作なし）
 */
export function isStepUpRecent(stepUpAtIso: string | null): boolean {
  if (!stepUpAtIso) return false;
  const step = new Date(stepUpAtIso).getTime();
  if (!Number.isFinite(step)) return false;
  return Date.now() - step <= ADMIN_STEPUP_TTL_MINUTES * 60 * 1000;
}