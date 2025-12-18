// lib/repositories/signupRepository.ts
import { supabase } from "@/lib/supabaseClient";
import type {
  DbSignupApplicationRow,
  DbSignupType,
  DbSignupStatus,
} from "@/types/db";

export type CreateSignupPayload = {
  type: DbSignupType; // "store" | "therapist" | "user"
  name: string;
  contact?: string | null;
  payload: Record<string, any>;
};

function preview(s: string, n = 300) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "..." : s;
}

/**
 * ブラウザ側セッションから access_token を取得
 * - API Route が Bearer 必須設計のため、ここが必須
 */
async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn("[signupRepository] getSession error:", error.message);
  }
  const raw = data.session?.access_token ?? null;
  const token = raw?.trim() ?? null;
  // access_token は十分長いので、短すぎる場合は異常扱い
  if (!token || token.length < 30) return null;
  return token;
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function safeJsonParse<T = any>(text: string): T | null {
  try {
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

export async function createSignupApplication(
  params: CreateSignupPayload
): Promise<DbSignupApplicationRow | null> {
  const { type, name, contact = null, payload } = params;

  // ===== デバッグ：送信直前にセッションの user id だけ出す（秘密は出さない）=====
  try {
    const { data: s } = await supabase.auth.getSession();
    console.log(
      "[signupRepository] session user id =",
      s.session?.user?.id ?? null
    );
  } catch {}
  // ======================================================================

  const token = await getAccessToken();
  if (!token) {
    console.error("[signupRepository] Not authenticated: missing access_token");
    return null;
  }

  // ===== デバッグ：token先頭だけ =====
  console.log("[signupRepository] token head =", token.slice(0, 24));
  // ==================================

  let res: Response;
  try {
    res = await fetch("/api/signup-applications", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        // ★重要：API側が Bearer 必須
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
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
  const bodyText = await safeReadText(res);

  if (!res.ok) {
    console.error(
      `[signupRepository] API error: status=${res.status} ${res.statusText} content-type=${ct} body=${preview(
        bodyText
      )}`
    );
    const j = safeJsonParse(bodyText);
    if (j) {
      console.error(
        `[signupRepository] API error json=${preview(JSON.stringify(j))}`
      );
    }
    return null;
  }

  const json = safeJsonParse<{ ok?: boolean; data?: any }>(bodyText);
  if (!json) {
    console.error(
      "[signupRepository] response is not json",
      { ct, body: preview(bodyText) }
    );
    return null;
  }

  return (json.data ?? null) as DbSignupApplicationRow | null;
}

export async function createStoreSignup(params: {
  name: string;
  contact?: string | null;
  payload: Record<string, any>;
}) {
  return createSignupApplication({
    type: "store",
    name: params.name,
    contact: params.contact ?? null,
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
    contact: params.contact ?? null,
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
    contact: params.contact ?? null,
    payload: params.payload,
  });
}

// ===== 管理画面用（一覧取得 / ステータス更新）=====

export async function listSignupApplications(params?: {
  type?: DbSignupType;
  status?: DbSignupStatus;
  limit?: number;
}): Promise<DbSignupApplicationRow[]> {
  const type = params?.type;
  const status = params?.status;
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