// lib/repositories/storeRepository.ts
import { supabase } from "@/lib/supabaseClient";
import type { UserId } from "@/types/user";
import type { DbStoreRow, DbTherapistRow } from "@/types/db";

/**
 * 店舗1件取得
 */
export async function getStoreById(id: string): Promise<DbStoreRow | null> {
  const { data, error } = await supabase
    .from("stores")
    .select("id, owner_user_id, name, area, description, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[storeRepository.getStoreById] Supabase error:", error);
    return null;
  }

  return data as DbStoreRow | null;
}

/**
 * owner_user_id から店舗取得（MYPAGE 用など）
 */
export async function getStoreByOwnerUserId(
  ownerUserId: UserId
): Promise<DbStoreRow | null> {
  const { data, error } = await supabase
    .from("stores")
    .select("id, owner_user_id, name, area, description, created_at")
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();

  if (error) {
    console.error(
      "[storeRepository.getStoreByOwnerUserId] Supabase error:",
      error
    );
    return null;
  }

  return data as DbStoreRow | null;
}

/**
 * 店舗プロフィール更新
 */
export async function updateStoreProfile(
  id: string,
  values: Partial<Pick<DbStoreRow, "name" | "area" | "description">>
): Promise<DbStoreRow | null> {
  const { data, error } = await supabase
    .from("stores")
    .update(values)
    .eq("id", id)
    .select("id, owner_user_id, name, area, description, created_at")
    .maybeSingle();

  if (error) {
    console.error("[storeRepository.updateStoreProfile] Supabase error:", error);
    return null;
  }

  return data as DbStoreRow | null;
}

/**
 * 店舗に紐づくセラピスト一覧
 */
export async function getTherapistsForStore(
  storeId: string
): Promise<DbTherapistRow[]> {
  const { data, error } = await supabase
    .from("therapists")
    .select(
      "id, user_id, store_id, display_name, area, profile, created_at"
    )
    .eq("store_id", storeId);

  if (error) {
    console.error(
      "[storeRepository.getTherapistsForStore] Supabase error:",
      error
    );
    return [];
  }

  return (data ?? []) as DbTherapistRow[];
}