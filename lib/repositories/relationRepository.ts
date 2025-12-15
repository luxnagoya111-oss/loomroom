// lib/repositories/relationRepository.ts
// フォロー / ミュート / ブロックの「サーバー側」ストレージ（Supabase）

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

// UUID 判定（relations は users.id(uuid) 前提）
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

function logSupabaseError(tag: string, error: any) {
  // supabase-js の error は環境により {} に見えることがあるので、
  // 取りうる情報をまとめて出す
  console.error(tag, {
    name: error?.name,
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
    status: error?.status,
  });
}

/**
 * 自分 → 相手 の関係を1件取得
 */
export async function getRelation(
  userId: UserId,
  targetId: UserId
): Promise<DbRelationRow | null> {
  // relations は uuid 前提
  if (!isUuid(userId) || !isUuid(targetId)) return null;

  const res = await supabase
    .from("relations")
    .select("*")
    .eq("user_id", userId)
    .eq("target_id", targetId)
    .maybeSingle();

  if (res.error) {
    logSupabaseError("[relationRepository.getRelation] Supabase error:", res.error);
    // ここで status も見たい場合
    console.error("[relationRepository.getRelation] http:", {
      status: (res as any).status,
      statusText: (res as any).statusText,
    });
    return null;
  }

  return (res.data as DbRelationRow) ?? null;
}

/**
 * 自分が持っている relations 全件を取得
 */
export async function getRelationsForUser(userId: UserId): Promise<DbRelationRow[]> {
  if (!isUuid(userId)) return [];

  const res = await supabase.from("relations").select("*").eq("user_id", userId);

  if (res.error) {
    logSupabaseError(
      "[relationRepository.getRelationsForUser] Supabase error:",
      res.error
    );
    console.error("[relationRepository.getRelationsForUser] http:", {
      status: (res as any).status,
      statusText: (res as any).statusText,
    });
    return [];
  }

  return (res.data as DbRelationRow[]) ?? [];
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

  // relations は uuid 前提。guest 等ならサーバーに書かない
  if (!isUuid(userId) || !isUuid(targetId)) {
    console.warn("[relationRepository.setRelation] skip (non-uuid)", {
      userId,
      targetId,
      type,
    });
    return false;
  }

  // auth 状態（RLS/401 を切り分けるためのログ）
  try {
    const { data: auth } = await supabase.auth.getUser();
    console.log("[relationRepository.setRelation] auth.uid:", auth?.user?.id);
  } catch (e) {
    console.warn("[relationRepository.setRelation] auth.getUser failed:", e);
  }

  if (!type) {
    const res = await supabase
      .from("relations")
      .delete()
      .eq("user_id", userId)
      .eq("target_id", targetId);

    if (res.error) {
      logSupabaseError("[relationRepository.setRelation:delete] error:", res.error);
      console.error("[relationRepository.setRelation:delete] http:", {
        status: (res as any).status,
        statusText: (res as any).statusText,
      });
      return false;
    }

    return true;
  }

  const res = await supabase.from("relations").upsert(
    {
      user_id: userId,
      target_id: targetId,
      type,
    },
    { onConflict: "user_id,target_id" }
  );

  if (res.error) {
    logSupabaseError("[relationRepository.setRelation:upsert] error:", res.error);
    console.error("[relationRepository.setRelation:upsert] http:", {
      status: (res as any).status,
      statusText: (res as any).statusText,
    });
    // 追加で payload も出す（RLS/制約違反の切り分け）
    console.error("[relationRepository.setRelation:upsert] payload:", {
      userId,
      targetId,
      type,
    });
    return false;
  }

  return true;
}