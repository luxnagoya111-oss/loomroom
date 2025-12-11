// lib/repositories/reportRepository.ts
import { supabase } from "@/lib/supabaseClient";
import type { UserId } from "@/types/user";

/**
 * 投稿通報（汎用 reports テーブル）
 * - target_type: "post"
 * - target_id: postId
 * - reporter_id: 通報したユーザー
 */
export async function reportPost(
  postId: string,
  reporterId: UserId,
  reason: string | null = null
): Promise<boolean> {
  const { error } = await supabase.from("reports").insert([
    {
      target_type: "post",
      target_id: postId,
      reporter_id: reporterId,
      reason,
    },
  ]);

  if (error) {
    console.error(
      "[reportRepository.reportPost] Supabase error:",
      error,
      "message:",
      (error as any)?.message,
      "code:",
      (error as any)?.code
    );
    return false;
  }

  return true;
}