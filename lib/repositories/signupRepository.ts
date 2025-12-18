// lib/repositories/signupRepository.ts
import { supabase } from "@/lib/supabaseClient";
import type {
  DbSignupApplicationRow,
  DbSignupType,
  DbSignupStatus,
} from "@/types/db";

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

/**
 * approve_store_signup() が期待する payload キーへ寄せる
 * - フォームから来るキー（area, website, note...）をDB側が読むキーへ変換
 */
function normalizeSignupPayload(
  type: DbSignupType,
  raw: Record<string, any>
): Record<string, any> {
  const p = raw ?? {};

  // storeForm:
  //  storeName, area, contactName, contact, website, note
  // function expects:
  //  payload->>'area', payload->>'description', payload->>'website_url', payload->>'x_url', payload->>'twicas_url', payload->>'line_url', payload->>'dm_notice', payload->>'avatar_url'
  if (type === "store") {
    return {
      // approve_store_signup が読むキー
      area: p.area ?? "",
      description: p.note ?? p.description ?? "",
      website_url: p.website ?? p.website_url ?? "",
      line_url: p.line ?? p.line_url ?? "",
      x_url: p.x ?? p.x_url ?? "",
      twicas_url: p.twicas ?? p.twicas_url ?? "",
      dm_notice:
        typeof p.dm_notice === "boolean"
          ? p.dm_notice
          : p.dmNotice ?? true,
      avatar_url: p.avatar_url ?? p.avatarUrl ?? "",

      // 参照用に残しておく（運用メモ）
      contact_name: p.contactName ?? p.contact_name ?? "",
      contact_raw: p.contact ?? "",
    };
  }

  // therapistForm:
  //  name, area, experience, contact, wishStore, note
  if (type === "therapist") {
    return {
      area: p.area ?? "",
      experience: p.experience ?? "",
      wish_store: p.wishStore ?? p.wish_store ?? "",
      note: p.note ?? "",
      contact_raw: p.contact ?? "",
    };
  }

  // user signupなど（必要に応じて整形）
  return { ...p };
}

export async function createSignupApplication(
  params: CreateSignupPayload
): Promise<DbSignupApplicationRow | null> {
  const { type, name, contact = null } = params;

  // Authユーザー（= applicant_user_id）
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;

  if (userError || !user) {
    console.error("[signupRepository] Not authenticated", userError);
    return null;
  }

  const payload = normalizeSignupPayload(type, params.payload);

  // ★ API 経由にせず、フロントから直接 insert（Auth JWT が載るのでRLSが通る）
  const { data, error } = await supabase
    .from("signup_applications")
    .insert({
      applicant_user_id: user.id,
      type,
      name,
      contact,
      payload,
      // status はDB defaultがある想定。無ければここで "pending" を入れる
      // status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    console.error("[signupRepository] insert signup_applications error:", {
      code: (error as any).code,
      message: error.message,
      details: (error as any).details,
      hint: (error as any).hint,
      type,
      name,
      contact,
      payloadPreview: preview(JSON.stringify(payload)),
    });
    return null;
  }

  return (data ?? null) as DbSignupApplicationRow | null;
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
// ※ 管理画面は supabaseAdmin 経由APIがより安全（RLSに左右されない）
// ただし「一覧が0件」の時は、まず insert が入っているかを優先で確認。

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