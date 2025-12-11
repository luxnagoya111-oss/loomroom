// lib/repositories/signupRepository.ts
// signup_applications テーブル用のリポジトリ
// - 一般ユーザー / セラピスト / 店舗 すべての審査申請をここで扱う

import { supabase } from "@/lib/supabaseClient";
import type {
  DbSignupApplicationRow,
  DbSignupType,
  DbSignupStatus,
} from "@/types/db";

/**
 * 申請作成時に必要なペイロード
 *
 * name   : 申請者名 or 店名（一覧での主表示）
 * contact: 任意の連絡先（メール / LINE など）
 * payload: フォーム固有の入力内容をそのまま格納
 */
export type CreateSignupPayload = {
  type: DbSignupType;
  name: string;
  contact?: string | null;
  payload: Record<string, any>;
};

/**
 * signup_applications に 1件 insert する（共通）
 */
export async function createSignupApplication(
  params: CreateSignupPayload
): Promise<DbSignupApplicationRow | null> {
  const { type, name, contact = null, payload } = params;

  const { data, error } = await supabase
    .from("signup_applications")
    .insert({
      type,
      status: "pending" as DbSignupStatus,
      name,
      contact,
      payload,
    })
    .select("*")
    .maybeSingle<DbSignupApplicationRow>();

  if (error) {
    console.error(
      "[signupRepository.createSignupApplication] Supabase error:",
      error
    );
    return null;
  }

  return data as DbSignupApplicationRow | null;
}

/**
 * セラピスト申請向けショートカット
 */
export async function createTherapistSignup(params: {
  name: string;
  contact?: string | null;
  payload: Record<string, any>;
}): Promise<DbSignupApplicationRow | null> {
  return createSignupApplication({
    type: "therapist",
    name: params.name,
    contact: params.contact,
    payload: params.payload,
  });
}

/**
 * 店舗申請向けショートカット
 */
export async function createStoreSignup(params: {
  name: string;
  contact?: string | null;
  payload: Record<string, any>;
}): Promise<DbSignupApplicationRow | null> {
  return createSignupApplication({
    type: "store",
    name: params.name,
    contact: params.contact,
    payload: params.payload,
  });
}

/**
 * 一般ユーザー申請向けショートカット（必要に応じて使う）
 */
export async function createUserSignup(params: {
  name: string;
  contact?: string | null;
  payload: Record<string, any>;
}): Promise<DbSignupApplicationRow | null> {
  return createSignupApplication({
    type: "user",
    name: params.name,
    contact: params.contact,
    payload: params.payload,
  });
}

/**
 * ID で 1件取得（管理画面の詳細表示用）
 */
export async function getSignupApplicationById(
  id: string
): Promise<DbSignupApplicationRow | null> {
  const { data, error } = await supabase
    .from("signup_applications")
    .select("*")
    .eq("id", id)
    .maybeSingle<DbSignupApplicationRow>();

  if (error) {
    console.error(
      "[signupRepository.getSignupApplicationById] Supabase error:",
      error
    );
    return null;
  }

  return (data as DbSignupApplicationRow | null) ?? null;
}

/**
 * 一覧取得
 * - type / status で絞り込み可能
 * - 新しい順に並べる
 */
export async function listSignupApplications(params?: {
  type?: DbSignupType;
  status?: DbSignupStatus;
  limit?: number;
}): Promise<DbSignupApplicationRow[]> {
  const { type, status, limit } = params ?? {};

  let query = supabase
    .from("signup_applications")
    .select("*")
    .order("created_at", { ascending: false });

  if (type) {
    query = query.eq("type", type);
  }
  if (status) {
    query = query.eq("status", status);
  }
  if (typeof limit === "number") {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error(
      "[signupRepository.listSignupApplications] Supabase error:",
      error
    );
    return [];
  }

  return (data ?? []) as DbSignupApplicationRow[];
}

/**
 * ステータス更新（承認 / 却下など）
 */
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
    .maybeSingle<DbSignupApplicationRow>();

  if (error) {
    console.error(
      "[signupRepository.updateSignupStatus] Supabase error:",
      error
    );
    return null;
  }

  return data as DbSignupApplicationRow | null;
}

/**
 * 店舗 signup を承認し、
 * - stores への正式登録
 * - 該当ユーザーの role = "store" 付与
 * - signup_applications.status = "approved"
 * を 1 トランザクションで行う RPC 呼び出し
 *
 * ※ Supabase 側に approve_store_signup(p_app_id uuid) が定義されている前提
 */
export async function approveStoreSignup(
  id: string
): Promise<DbSignupApplicationRow | null> {
  const { data, error } = await supabase.rpc("approve_store_signup", {
    p_app_id: id,
  });

  if (error) {
    console.error("[signupRepository.approveStoreSignup] error:", error);
    return null;
  }

  // RPC は signup_applications の 1 行を返す想定
  return data as DbSignupApplicationRow | null;
}