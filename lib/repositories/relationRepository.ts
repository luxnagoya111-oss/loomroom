// lib/repositories/relationRepository.ts
// フォロー / ミュート / ブロックの「サーバー側」ストレージ

import { supabase } from "@/lib/supabaseClient";
import type { UserId } from "@/types/user";
import type { DbRelationRow, DbRelationType } from "@/types/db";

export type RelationFlags = {
  following: boolean;
  muted: boolean;
  blocked: boolean;
};

export function toRelationFlags(row: DbRelationRow | null): RelationFlags {
  const type = row?.type ?? null;
  return {
    following: type === "follow",
    muted: type === "mute",
    blocked: type === "block",
  };
}

/**
 * 自分 → 相手 の関係を1件取得
 */
export async function getRelation(
  userId: UserId,
  targetId: UserId
): Promise<DbRelationRow | null> {
  const { data, error } = await supabase
    .from("relations")
    .select("*")
    .eq("user_id", userId)
    .eq("target_id", targetId)
    .maybeSingle();

  if (error) {
    console.error("[relationRepository.getRelation] Supabase error:", error);
    return null;
  }

  return data ?? null;
}

/**
 * 自分が持っている relations 全件を取得
 */
export async function getRelationsForUser(
  userId: UserId
): Promise<DbRelationRow[]> {
  const { data, error } = await supabase
    .from("relations")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    console.error(
      "[relationRepository.getRelationsForUser] Supabase error:",
      error
    );
    return [];
  }

  return data ?? [];
}

type SetRelationParams = {
  userId: UserId;
  targetId: UserId;
  /**
   * null の場合は関係削除
   */
  type: DbRelationType | null;
};

/**
 * 指定した種別の関係をセットする
 * - params.type が null の場合: 関係を削除
 * - params.type が "follow" | "mute" | "block" の場合: 1レコードを upsert（既存は上書き）
 *   ※ DB 側のユニークキー: (user_id, target_id)
 */
export async function setRelation(params: SetRelationParams): Promise<boolean> {
  const { userId, targetId, type } = params;

  if (!type) {
    const { error } = await supabase
      .from("relations")
      .delete()
      .eq("user_id", userId)
      .eq("target_id", targetId);

    if (error) {
      console.error("[relationRepository.setRelation:delete] error:", error);
      return false;
    }

    return true;
  }

  const { error } = await supabase.from("relations").upsert(
    {
      user_id: userId,
      target_id: targetId,
      type,
    },
    {
      onConflict: "user_id,target_id",
    }
  );

  if (error) {
    console.error("[relationRepository.setRelation:upsert] error:", error);
    return false;
  }

  return true;
}