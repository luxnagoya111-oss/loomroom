// lib/repositories/userRepository.ts
import { supabase } from "@/lib/supabaseClient";
import type { UserId } from "@/types/user";
import type { DbUserRow } from "@/types/db";

/**
 * 単一ユーザー取得（見つからなければ null）
 * 公開プロフィール(public_profiles)から取得
 */
export async function getUserById(id: UserId): Promise<DbUserRow | null> {
  const { data, error } = await supabase
    .from("public_profiles")
    .select("id, name, role, avatar_url, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[userRepository.getUserById] Supabase error:", error);
    return null;
  }

  return (data ?? null) as DbUserRow | null;
}

/**
 * 複数IDから公開プロフィール(public_profiles)を取得
 */
export async function getUsersByIds(ids: UserId[]): Promise<DbUserRow[]> {
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from("public_profiles")
    .select("id, name, role, avatar_url, created_at")
    .in("id", ids);

  if (error) {
    console.error("[userRepository.getUsersByIds] Supabase error:", error);
    return [];
  }

  return (data ?? []) as DbUserRow[];
}

/**
 * プロフィール更新（公開表示名・アイコン等）
 * public_profiles を本人だけ更新できる RLS 前提
 */
export async function updateUserProfile(
  id: UserId,
  values: Partial<Pick<DbUserRow, "name" | "avatar_url" | "role">>
): Promise<DbUserRow | null> {
  const { data, error } = await supabase
    .from("public_profiles")
    .update(values)
    .eq("id", id)
    .select("id, name, role, avatar_url, created_at")
    .maybeSingle();

  if (error) {
    console.error("[userRepository.updateUserProfile] Supabase error:", error);
    return null;
  }

  return (data ?? null) as DbUserRow | null;
}