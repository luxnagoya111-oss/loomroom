// lib/repositories/connectionRepository.ts
// フォロワー / フォロー「集合」を扱う repository
// users.id(uuid) 正基準

import { supabase } from "@/lib/supabaseClient";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

/**
 * フォロワー数 / フォロー数を取得
 */
export async function getConnectionCounts(userId: string) {
  if (!isUuid(userId)) {
    return { followers: 0, follows: 0 };
  }

  const [{ count: followers }, { count: follows }] = await Promise.all([
    supabase
      .from("relations")
      .select("*", { count: "exact", head: true })
      .eq("type", "follow")
      .eq("target_id", userId),

    supabase
      .from("relations")
      .select("*", { count: "exact", head: true })
      .eq("type", "follow")
      .eq("user_id", userId),
  ]);

  return {
    followers: followers ?? 0,
    follows: follows ?? 0,
  };
}