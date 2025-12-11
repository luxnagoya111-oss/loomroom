// lib/repositories/userRepository.ts
import { supabase } from "@/lib/supabaseClient";
import type { UserId } from "@/types/user";
import type { DbUserRow } from "@/types/db";

/**
 * 単一ユーザー取得（見つからなければ null）
 */
export async function getUserById(id: UserId): Promise<DbUserRow | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, role, avatar_url, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[userRepository.getUserById] Supabase error:", error);
    return null;
  }

  return data as DbUserRow | null;
}

/**
 * 複数IDから users を取得
 * - 見つからなかったIDは結果に含まれない
 */
export async function getUsersByIds(ids: UserId[]): Promise<DbUserRow[]> {
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from("users")
    .select("id, name, role, avatar_url, created_at")
    .in("id", ids);

  if (error) {
    console.error("[userRepository.getUsersByIds] Supabase error:", error);
    return [];
  }

  return (data ?? []) as DbUserRow[];
}

/**
 * プロフィール更新
 * - name / avatar_url / role を部分的に更新可能
 */
export async function updateUserProfile(
  id: UserId,
  values: Partial<Pick<DbUserRow, "name" | "avatar_url" | "role">>
): Promise<DbUserRow | null> {
  const { data, error } = await supabase
    .from("users")
    .update(values)
    .eq("id", id)
    .select("id, name, role, avatar_url, created_at")
    .maybeSingle();

  if (error) {
    console.error("[userRepository.updateUserProfile] Supabase error:", error);
    return null;
  }

  return data as DbUserRow | null;
}