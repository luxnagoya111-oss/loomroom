// lib/repositories/signupRepository.ts
import { supabase } from "@/lib/supabaseClient";
import type { DbSignupApplicationRow, DbSignupType, DbSignupStatus } from "@/types/db";

export type CreateSignupPayload = {
  type: DbSignupType;
  name: string;
  contact?: string | null;
  payload: Record<string, any>;
};

function preview(s: string, n = 300) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "..." : s;
}

export async function createSignupApplication(
  params: CreateSignupPayload
): Promise<DbSignupApplicationRow | null> {
  const { type, name, contact = null, payload } = params;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;

  if (userError || !user) {
    console.error("[signupRepository] Not authenticated", userError);
    return null;
  }

  let res: Response;
  try {
    res = await fetch("/api/signup-applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicant_user_id: user.id,
        type,
        name,
        contact,
        payload,
      }),
    });
  } catch (e) {
    console.error("[signupRepository] fetch failed", e);
    return null;
  }

  const ct = res.headers.get("content-type") ?? "";
  const bodyText = await res.text().catch(() => "");

  if (!res.ok) {
    console.error(
      `[signupRepository] API error: status=${res.status} ${res.statusText} content-type=${ct} body=${preview(bodyText)}`
    );
    try {
      const j = bodyText ? JSON.parse(bodyText) : null;
      console.error(`[signupRepository] API error json=${preview(JSON.stringify(j))}`);
    } catch {}
    return null;
  }

  // OKでも JSONじゃないことがあるので守る
  try {
    const json = bodyText ? JSON.parse(bodyText) : null;
    return (json?.data ?? null) as DbSignupApplicationRow | null;
  } catch (e) {
    console.error("[signupRepository] response is not json", { ct, body: preview(bodyText) }, e);
    return null;
  }
}

export async function createStoreSignup(params: {
  name: string;
  contact?: string | null;
  payload: Record<string, any>;
}) {
  return createSignupApplication({
    type: "store",
    name: params.name,
    contact: params.contact,
    payload: params.payload,
  });
}

export async function createTherapistSignup(params: {
  name: string;
  contact?: string | null;
  payload: Record<string, any>;
}) {
  return createSignupApplication({
    type: "therapist",
    name: params.name,
    contact: params.contact,
    payload: params.payload,
  });
}

export async function createUserSignup(params: {
  name: string;
  contact?: string | null;
  payload: Record<string, any>;
}) {
  return createSignupApplication({
    type: "user",
    name: params.name,
    contact: params.contact,
    payload: params.payload,
  });
}

// ===== 管理画面用（一覧取得 / ステータス更新）=====

// 申請一覧（管理者ページ用）
// ※RLSが厳しい場合は、後で /api 経由（supabaseAdmin）に切り替えるのが安全
export async function listSignupApplications(params?: {
  type?: DbSignupType;
  status?: DbSignupStatus;
  limit?: number;
}): Promise<DbSignupApplicationRow[]> {
  const type = params?.type;
  const status = params?.status; // undefined の場合は全件
  const limit = params?.limit ?? 50;

  let q = supabase
    .from("signup_applications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (type) q = q.eq("type", type);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;

  if (error) {
    console.error("[signupRepository] listSignupApplications error:", error);
    return [];
  }

  return (data ?? []) as DbSignupApplicationRow[];
}

// 申請ステータス更新（管理者ページ用）
export async function updateSignupStatus(params: {
  id: string;
  status: DbSignupStatus;
}): Promise<DbSignupApplicationRow | null> {
  const { id, status } = params;

  const { data, error } = await supabase
    .from("signup_applications")
    .update({
      status,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("[signupRepository] updateSignupStatus error:", error);
    return null;
  }

  return (data ?? null) as DbSignupApplicationRow | null;
}