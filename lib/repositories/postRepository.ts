// lib/repositories/postRepository.ts
import { supabase } from "@/lib/supabaseClient";
import type { UserId } from "@/types/user";

export type AuthorKind = "user" | "therapist" | "store";

export type DbPostRow = {
  id: string;
  author_id: string | null;
  author_kind: AuthorKind | null;
  body: string | null;
  created_at: string;
  like_count: number | null;
  reply_count: number | null;

  // 返信導入に備えつつ、TLでは除外したい
  reply_to_id?: string | null;

  // 画像（正）
  image_paths?: string[] | null;

  // 互換
  image_urls?: string[] | null;
  imageUrls?: string[] | null;
  imageUrl?: string | null;
  image_path?: string | null;
};

export type DbPostLikeRow = { post_id: string };

export type CreatePostParams = {
  authorId: string | null;
  authorKind: AuthorKind | null;
  body: string;
  replyToId?: string | null;
  imagePaths?: string[] | null; // DBへは path（bucket無し）を保存する想定
};

export async function createPost(params: CreatePostParams): Promise<DbPostRow | null> {
  const { authorId, authorKind, body, replyToId = null, imagePaths = null } = params;

  const { data, error } = await supabase
    .from("posts")
    .insert({
      author_id: authorId,
      author_kind: authorKind,
      body,
      reply_to_id: replyToId,
      image_paths: imagePaths,
    })
    .select(
      "id, author_id, author_kind, body, created_at, like_count, reply_count, reply_to_id, image_paths, image_urls"
    )
    .maybeSingle();

  if (error) {
    console.error("[postRepository.createPost] error:", error);
    return null;
  }
  return (data ?? null) as DbPostRow | null;
}

export async function fetchPostById(postId: string): Promise<DbPostRow | null> {
  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, author_id, author_kind, body, created_at, like_count, reply_count, reply_to_id, image_paths, image_urls"
    )
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    console.error("[postRepository.fetchPostById] error:", error);
    return null;
  }
  return (data ?? null) as DbPostRow | null;
}

export async function fetchRecentPosts(params?: {
  limit?: number;
  excludeReplies?: boolean; // TLは親投稿のみ
}): Promise<DbPostRow[]> {
  const limit = params?.limit ?? 100;
  const excludeReplies = params?.excludeReplies ?? true;

  let q = supabase
    .from("posts")
    .select(
      "id, author_id, author_kind, body, created_at, like_count, reply_count, reply_to_id, image_paths, image_urls"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (excludeReplies) {
    q = q.is("reply_to_id", null);
  }

  const { data, error } = await q;
  if (error) {
    console.error("[postRepository.fetchRecentPosts] error:", error);
    return [];
  }
  return (data ?? []) as DbPostRow[];
}

/**
 * author_id は「users.id / therapists.id / stores.id」揺れがあるので
 * まずは「このauthor_idのどれかに一致」だけで絞れるAPIを用意。
 *
 * 例）ユーザーページ：自分のuuid + （自分がtherapistなら therapists.id） + （store ownerなら stores.id）
 */
export async function fetchPostsByAuthorIds(params: {
  authorIds: string[];
  excludeReplies?: boolean;
  limit?: number;
}): Promise<DbPostRow[]> {
  const { authorIds, excludeReplies = false, limit = 200 } = params;
  if (!authorIds.length) return [];

  let q = supabase
    .from("posts")
    .select(
      "id, author_id, author_kind, body, created_at, like_count, reply_count, reply_to_id, image_paths, image_urls"
    )
    .in("author_id", authorIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (excludeReplies) q = q.is("reply_to_id", null);

  const { data, error } = await q;
  if (error) {
    console.error("[postRepository.fetchPostsByAuthorIds] error:", error);
    return [];
  }
  return (data ?? []) as DbPostRow[];
}

export async function fetchLikedPostIdsForUser(userId: UserId): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("post_likes")
    .select("post_id")
    .eq("user_id", userId);

  if (error) {
    console.error("[postRepository.fetchLikedPostIdsForUser] error:", error);
    return new Set();
  }
  const rows = (data ?? []) as DbPostLikeRow[];
  return new Set(rows.map((r) => r.post_id));
}

/**
 * いいねのトグル（post_likes + posts.like_count）
 * - optimistic UI は呼び出し側でOK
 */
export async function toggleLike(params: {
  postId: string;
  userId: UserId;
  nextLiked: boolean;
  currentLikeCount: number;
}): Promise<{ ok: boolean; likeCount: number }> {
  const { postId, userId, nextLiked, currentLikeCount } = params;

  try {
    if (nextLiked) {
      const { error: likeErr } = await supabase
        .from("post_likes")
        .insert([{ post_id: postId, user_id: userId }]);
      if (likeErr) throw likeErr;

      const next = currentLikeCount + 1;
      const { error: updErr } = await supabase
        .from("posts")
        .update({ like_count: next })
        .eq("id", postId);
      if (updErr) throw updErr;

      return { ok: true, likeCount: next };
    } else {
      const { error: delErr } = await supabase
        .from("post_likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", userId);
      if (delErr) throw delErr;

      const next = Math.max(currentLikeCount - 1, 0);
      const { error: updErr } = await supabase
        .from("posts")
        .update({ like_count: next })
        .eq("id", postId);
      if (updErr) throw updErr;

      return { ok: true, likeCount: next };
    }
  } catch (e: any) {
    console.error("[postRepository.toggleLike] error:", e);
    return { ok: false, likeCount: currentLikeCount };
  }
}

/**
 * 通報（reports テーブルに統一）
 * - target_type="post"
 * - target_id=postId
 */
export async function reportPost(params: {
  postId: string;
  reporterId: UserId;
  reason?: string | null;
}): Promise<boolean> {
  const { postId, reporterId, reason = null } = params;

  const { error } = await supabase.from("reports").insert([
    {
      target_type: "post",
      target_id: postId,
      reporter_id: reporterId,
      reason,
    },
  ]);

  if (error) {
    console.error("[postRepository.reportPost] error:", error);
    return false;
  }
  return true;
}

/**
 * 投稿削除（安全のため API Route 経由）
 * - RLS OFF の posts に対してフロント直 delete は危険なので禁止
 */
export async function deletePost(params: {
  postId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { postId } = params;

  try {
    const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) throw sessErr;

    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      return { ok: false, error: "not_logged_in" };
    }

    const res = await fetch("/api/posts/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ postId }),
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { _raw: text };
    }

    if (!res.ok) {
      return { ok: false, error: json?.error ?? `http_${res.status}` };
    }
    return { ok: true };
  } catch (e: any) {
    console.error("[postRepository.deletePost] error:", e);
    return { ok: false, error: e?.message ?? "unknown_error" };
  }
}