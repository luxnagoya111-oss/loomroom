// lib/repositories/postRepository.ts
import { supabase } from "@/lib/supabaseClient";
import type { UserId } from "@/types/user";
import type {
  DbPostRow,
  DbPostLikeRow,
  DbPostReportRow,
} from "@/types/db";

export type CreatePostParams = {
  authorId: UserId | null;
  authorKind: "user" | "therapist" | "store" | null;
  area: string | null;
  body: string;
};

/**
 * 投稿作成
 * - posts テーブルに1行 insert
 * - like_count / reply_count は 0 初期化前提（DB側 default 推奨）
 */
export async function createPost(
  params: CreatePostParams
): Promise<DbPostRow | null> {
  const { authorId, authorKind, area, body } = params;

  const { data, error } = await supabase
    .from("posts")
    .insert({
      author_id: authorId,
      author_kind: authorKind,
      area,
      body,
    })
    .select(
      "id, author_id, author_kind, body, area, created_at, like_count, reply_count"
    )
    .maybeSingle();

  if (error) {
    console.error("[postRepository.createPost] Supabase error:", error);
    return null;
  }

  return data as DbPostRow | null;
}

/**
 * ホームTL用：最近の投稿を取得
 * - ここではまだ「生の DB行」を返す（UI用変換はページ側 or 別層で担当）
 */
export async function fetchRecentPosts(
  limit = 100
): Promise<DbPostRow[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, author_id, author_kind, body, area, created_at, like_count, reply_count"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[postRepository.fetchRecentPosts] Supabase error:", error);
    return [];
  }

  return (data ?? []) as DbPostRow[];
}

/**
 * 特定ユーザーが「いいね」した投稿ID一覧を取得
 */
export async function fetchLikedPostIdsForUser(
  userId: UserId
): Promise<string[]> {
  const { data, error } = await supabase
    .from("post_likes")
    .select("post_id, user_id, created_at")
    .eq("user_id", userId);

  if (error) {
    console.error(
      "[postRepository.fetchLikedPostIdsForUser] Supabase error:",
      error
    );
    return [];
  }

  const rows = (data ?? []) as DbPostLikeRow[];
  return rows.map((r) => r.post_id);
}

/**
 * いいね追加
 */
export async function likePost(
  postId: string,
  userId: UserId
): Promise<boolean> {
  const { error } = await supabase
    .from("post_likes")
    .insert({ post_id: postId, user_id: userId });

  if (error) {
    console.error("[postRepository.likePost] Supabase error:", error);
    return false;
  }
  return true;
}

/**
 * いいね解除
 */
export async function unlikePost(
  postId: string,
  userId: UserId
): Promise<boolean> {
  const { error } = await supabase
    .from("post_likes")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", userId);

  if (error) {
    console.error("[postRepository.unlikePost] Supabase error:", error);
    return false;
  }
  return true;
}

/**
 * 投稿通報
 */
export async function reportPost(params: {
  postId: string;
  reporterId: UserId;
  reason?: string;
}): Promise<DbPostReportRow | null> {
  const { postId, reporterId, reason = null } = params;

  const { data, error } = await supabase
    .from("post_reports")
    .insert({
      post_id: postId,
      reporter_id: reporterId,
      reason,
    })
    .select("id, post_id, reporter_id, reason, created_at")
    .maybeSingle();

  if (error) {
    console.error("[postRepository.reportPost] Supabase error:", error);
    return null;
  }

  return data as DbPostReportRow | null;
}