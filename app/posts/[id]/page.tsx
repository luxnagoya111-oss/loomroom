// app/posts/[id]/page.tsx
"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import AvatarCircle from "@/components/AvatarCircle";
import { supabase } from "@/lib/supabaseClient";
import { timeAgo } from "@/lib/timeAgo";
import { toPublicHandleFromUserId } from "@/lib/handle";
import { ensureViewerId } from "@/lib/auth";
import { getRelationsForUser } from "@/lib/repositories/relationRepository";
import type { DbRelationRow } from "@/types/db";
import PostActionsMenu from "@/components/PostActionsMenu";

type AuthorRole = "therapist" | "store" | "user";

type DetailPost = {
  id: string;
  body: string;
  created_at: string;

  raw_author_id: string | null;
  raw_author_kind: AuthorRole;

  canonical_user_id: string | null;

  author_role: AuthorRole;
  author_name: string;

  author_handle: string | null;

  avatar_url: string | null;

  profile_path: string | null;

  // ★ 投稿画像（public URLに変換済み）
  image_urls: string[];

  // ★ いいね/返信
  like_count: number;
  reply_count: number;
  liked: boolean;

  // 親投稿は基本 null（将来の保険）
  reply_to_id: string | null;
};

type ReplyItem = {
  id: string;

  authorId: string; // canonical users.id（取れない場合は raw ）
  authorKind: AuthorRole;
  authorName: string;
  authorHandle: string | null;
  avatarUrl: string | null;
  profilePath: string | null;

  body: string;
  createdAt: string;
  timeAgoText: string;

  likeCount: number;
  liked: boolean;

  imageUrls: string[];
};

type DbPostRow = {
  id: string;
  body: string | null;
  created_at: string;
  author_id: string | null;
  author_kind: AuthorRole | null;

  like_count: number | null;
  reply_count: number | null;

  reply_to_id?: string | null;

  // 正：Storage path配列
  image_paths?: string[] | null;

  // 保険（古い揺れ）
  image_urls?: string[] | null;
  imageUrls?: string[] | null;
};

type DbUserRow = {
  id: string;
  name: string | null;
  role: AuthorRole | null;
  avatar_url: string | null;
};

type DbTherapistLite = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type DbStoreLite = {
  id: string;
  owner_user_id: string | null;
  name: string | null;
  avatar_url: string | null;
};

type DbPostLikeRow = {
  post_id: string;
};

const hasUnread = false;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

function normalizeUrl(v: any): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

function isProbablyHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * avatars bucket
 */
const AVATAR_BUCKET = "avatars";

/**
 * avatar_url が
 * - https://... ならそのまま
 * - それ以外（storage path）なら public URL に変換
 */
function resolveAvatarUrl(raw: string | null | undefined): string | null {
  const v = normalizeUrl(raw);
  if (!v) return null;
  if (isProbablyHttpUrl(v)) return v;

  const path = v.startsWith(`${AVATAR_BUCKET}/`)
    ? v.slice(AVATAR_BUCKET.length + 1)
    : v;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

/**
 * post-images bucket
 */
const POST_IMAGES_BUCKET = "post-images";

/**
 * 投稿画像を「表示用 public URL 配列」に正規化
 * - http(s) はそのまま
 * - storage path は post-images の public URL に変換
 * - "post-images/xxx" のような値でも耐える
 * - 最大4枚
 */
function resolvePostImageUrls(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: string[] = [];

  for (const v of arr) {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) continue;

    if (isProbablyHttpUrl(s)) {
      out.push(s);
      if (out.length >= 4) break;
      continue;
    }

    const path = s.startsWith(`${POST_IMAGES_BUCKET}/`)
      ? s.slice(POST_IMAGES_BUCKET.length + 1)
      : s;

    const { data } = supabase.storage.from(POST_IMAGES_BUCKET).getPublicUrl(path);
    const url = data?.publicUrl ?? "";

    if (url && isProbablyHttpUrl(url)) {
      out.push(url);
      if (out.length >= 4) break;
    }
  }

  return out;
}

function pickRawPostImages(row: any): unknown {
  return row?.image_paths ?? row?.image_urls ?? row?.imageUrls ?? null;
}

/**
 * viewerUuid（users.id）から「投稿の author_id / author_kind」を推定
 * - therapist: therapists.user_id == viewerUuid -> author_id = therapists.id, kind="therapist"
 * - store:     stores.owner_user_id == viewerUuid -> author_id = stores.id, kind="store"
 * - else:      author_id = viewerUuid, kind="user"
 *
 * ※ 既存投稿が role-table id を使うケースに寄せて、違和感なく混在できるようにする
 */
async function resolveViewerAuthorIdentity(viewerUuid: string): Promise<{
  authorId: string;
  authorKind: AuthorRole;
}> {
  // therapist
  const { data: tRow } = await supabase
    .from("therapists")
    .select("id, user_id")
    .eq("user_id", viewerUuid)
    .maybeSingle();

  if (tRow?.id) {
    return { authorId: String(tRow.id), authorKind: "therapist" };
  }

  // store
  const { data: sRow } = await supabase
    .from("stores")
    .select("id, owner_user_id")
    .eq("owner_user_id", viewerUuid)
    .maybeSingle();

  if (sRow?.id) {
    return { authorId: String(sRow.id), authorKind: "store" };
  }

  return { authorId: viewerUuid, authorKind: "user" };
}

export default function PostDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const postId = params?.id;

  const [viewerUuid, setViewerUuid] = useState<string | null>(null);

  const [post, setPost] = useState<DetailPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);

  // relations（mute/block）
  const [relations, setRelations] = useState<DbRelationRow[]>([]);

  // 返信一覧
  const [replies, setReplies] = useState<ReplyItem[]>([]);
  const [loadingReplies, setLoadingReplies] = useState<boolean>(false);
  const [repliesError, setRepliesError] = useState<string | null>(null);

  // ★ A：返信入力
  const [replyText, setReplyText] = useState<string>("");
  const [sendingReply, setSendingReply] = useState<boolean>(false);

  const profileClickable = useMemo(
    () => !!post?.profile_path,
    [post?.profile_path]
  );

  const viewerReady = !!viewerUuid && isUuid(viewerUuid);

  // viewerUuid（uuidのみ）確定
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const uid = await ensureViewerId(); // uuid or null
        if (cancelled) return;
        setViewerUuid(uid);
      } catch {
        if (cancelled) return;
        setViewerUuid(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // relations 取得（viewerUuid が uuid のときだけ）
  useEffect(() => {
    if (!viewerUuid || !isUuid(viewerUuid)) {
      setRelations([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const rows = await getRelationsForUser(viewerUuid);
        if (cancelled) return;
        setRelations(rows ?? []);
      } catch (e: any) {
        if (cancelled) return;
        console.error("[postDetail.getRelationsForUser] error:", e);
        setRelations([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewerUuid]);

  // 投稿詳細ロード
  useEffect(() => {
    if (!postId) return;

    if (!isUuid(postId)) {
      setError("不正な投稿IDです。");
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: postRow, error: postErr } = await supabase
          .from("posts")
          .select(
            "id, body, created_at, author_id, author_kind, like_count, reply_count, reply_to_id, image_paths"
          )
          .eq("id", postId)
          .maybeSingle();

        if (cancelled) return;

        if (postErr || !postRow) {
          console.error("[postDetail.posts] error:", postErr);
          setError("投稿が見つかりませんでした。");
          setLoading(false);
          return;
        }

        const row = postRow as DbPostRow;
        const rawAuthorId = row.author_id;
        const rawKind: AuthorRole = (row.author_kind ?? "user") as AuthorRole;

        // like済み判定（ログイン時のみ）
        let liked = false;
        if (viewerUuid && isUuid(viewerUuid)) {
          const { data: likeRow, error: likeErr } = await supabase
            .from("post_likes")
            .select("post_id")
            .eq("user_id", viewerUuid)
            .eq("post_id", row.id)
            .maybeSingle<DbPostLikeRow>();

          if (likeErr) {
            console.error("[postDetail.post_likes] error:", likeErr);
          } else {
            liked = !!likeRow;
          }
        }

        // user / therapist / store 解決
        let user: DbUserRow | null = null;
        if (rawAuthorId && isUuid(rawAuthorId)) {
          const { data: userRow, error: userErr } = await supabase
            .from("users")
            .select("id, name, role, avatar_url")
            .eq("id", rawAuthorId)
            .maybeSingle();

          if (userErr) console.error("[postDetail.users] error:", userErr);
          if (userRow) user = userRow as DbUserRow;
        }

        let therapist: DbTherapistLite | null = null;
        let store: DbStoreLite | null = null;

        if (rawAuthorId) {
          const { data: tById } = await supabase
            .from("therapists")
            .select("id, user_id, display_name, avatar_url")
            .eq("id", rawAuthorId)
            .maybeSingle();
          if (tById) therapist = tById as DbTherapistLite;

          if (!therapist && isUuid(rawAuthorId)) {
            const { data: tByUser } = await supabase
              .from("therapists")
              .select("id, user_id, display_name, avatar_url")
              .eq("user_id", rawAuthorId)
              .maybeSingle();
            if (tByUser) therapist = tByUser as DbTherapistLite;
          }

          const { data: sById } = await supabase
            .from("stores")
            .select("id, owner_user_id, name, avatar_url")
            .eq("id", rawAuthorId)
            .maybeSingle();
          if (sById) store = sById as DbStoreLite;

          if (!store && isUuid(rawAuthorId)) {
            const { data: sByOwner } = await supabase
              .from("stores")
              .select("id, owner_user_id, name, avatar_url")
              .eq("owner_user_id", rawAuthorId)
              .maybeSingle();
            if (sByOwner) store = sByOwner as DbStoreLite;
          }
        }

        const inferredKind: AuthorRole = therapist
          ? "therapist"
          : store
          ? "store"
          : (user?.role ?? rawKind ?? "user");

        let canonicalUserId: string | null = null;
        if (inferredKind === "therapist") canonicalUserId = therapist?.user_id ?? null;
        else if (inferredKind === "store") canonicalUserId = store?.owner_user_id ?? null;
        else canonicalUserId = user?.id ?? (isUuid(rawAuthorId) ? rawAuthorId : null);

        if (!user && canonicalUserId && isUuid(canonicalUserId)) {
          const { data: userRow } = await supabase
            .from("users")
            .select("id, name, role, avatar_url")
            .eq("id", canonicalUserId)
            .maybeSingle();
          if (userRow) user = userRow as DbUserRow;
        }

        const roleName =
          inferredKind === "therapist"
            ? (therapist?.display_name ?? "").trim() || null
            : inferredKind === "store"
            ? (store?.name ?? "").trim() || null
            : null;

        const authorName =
          roleName ||
          ((user?.name ?? "").trim() || null) ||
          (inferredKind === "store"
            ? "店舗アカウント"
            : inferredKind === "therapist"
            ? "セラピスト"
            : "名無し");

        const authorHandle =
          canonicalUserId && isUuid(canonicalUserId)
            ? toPublicHandleFromUserId(canonicalUserId)
            : null;

        const roleAvatarRaw =
          inferredKind === "therapist"
            ? therapist?.avatar_url ?? null
            : inferredKind === "store"
            ? store?.avatar_url ?? null
            : null;

        const userAvatarRaw = user?.avatar_url ?? null;
        const avatarUrl =
          resolveAvatarUrl(roleAvatarRaw) ?? resolveAvatarUrl(userAvatarRaw) ?? null;

        let profilePath: string | null = null;
        if (inferredKind === "therapist") {
          profilePath = therapist?.id ? `/therapist/${therapist.id}` : null;
          if (!profilePath && canonicalUserId) profilePath = `/mypage/${canonicalUserId}`;
        } else if (inferredKind === "store") {
          profilePath = store?.id ? `/store/${store.id}` : null;
          if (!profilePath && canonicalUserId) profilePath = `/mypage/${canonicalUserId}`;
        } else {
          if (canonicalUserId) profilePath = `/mypage/${canonicalUserId}`;
        }

        // 画像：image_paths を正としてURL配列に変換
        const rawImages = pickRawPostImages(row as any);
        const imageUrls = resolvePostImageUrls(rawImages);

        if (cancelled) return;

        setPost({
          id: row.id,
          body: row.body ?? "",
          created_at: row.created_at,
          raw_author_id: rawAuthorId ?? null,
          raw_author_kind: rawKind,
          canonical_user_id: canonicalUserId,
          author_role: inferredKind,
          author_name: authorName,
          author_handle: authorHandle ?? null,
          avatar_url: avatarUrl,
          profile_path: profilePath,
          image_urls: imageUrls,
          like_count: row.like_count ?? 0,
          reply_count: row.reply_count ?? 0,
          liked,
          reply_to_id: (row as any).reply_to_id ?? null,
        });

        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        console.error("post detail error:", e);
        setError(e?.message ?? "読み込み中にエラーが発生しました");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [postId, viewerUuid]);

  const goToProfile = () => {
    if (!post?.profile_path) return;
    router.push(post.profile_path);
  };

  const handleToggleLike = async () => {
    if (!post) return;
    if (!viewerUuid || !isUuid(viewerUuid)) return;

    const previousLiked = post.liked;
    const previousCount = post.like_count;

    setPost((prev) =>
      prev
        ? {
            ...prev,
            liked: !previousLiked,
            like_count: previousCount + (!previousLiked ? 1 : -1),
          }
        : prev
    );

    try {
      if (!previousLiked) {
        const { error: likeError } = await supabase
          .from("post_likes")
          .insert([{ post_id: post.id, user_id: viewerUuid }]);
        if (likeError) throw likeError;

        const { error: updateError } = await supabase
          .from("posts")
          .update({ like_count: previousCount + 1 })
          .eq("id", post.id);
        if (updateError) throw updateError;
      } else {
        const { error: deleteError } = await supabase
          .from("post_likes")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", viewerUuid);
        if (deleteError) throw deleteError;

        const { error: updateError } = await supabase
          .from("posts")
          .update({ like_count: Math.max(previousCount - 1, 0) })
          .eq("id", post.id);
        if (updateError) throw updateError;
      }
    } catch (e: any) {
      console.error("Supabase like toggle error:", e);

      setPost((prev) =>
        prev ? { ...prev, liked: previousLiked, like_count: previousCount } : prev
      );

      alert(
        e?.message ??
          "いいねの反映中にエラーが発生しました。時間をおいて再度お試しください。"
      );
    }
  };

  const handleToggleLikeOnReply = async (reply: ReplyItem) => {
    if (!viewerUuid || !isUuid(viewerUuid)) return;

    const prevLiked = reply.liked;
    const prevCount = reply.likeCount;

    setReplies((prev) =>
      prev.map((r) =>
        r.id === reply.id
          ? {
              ...r,
              liked: !prevLiked,
              likeCount: prevCount + (!prevLiked ? 1 : -1),
            }
          : r
      )
    );

    try {
      if (!prevLiked) {
        const { error: likeError } = await supabase
          .from("post_likes")
          .insert([{ post_id: reply.id, user_id: viewerUuid }]);
        if (likeError) throw likeError;

        const { error: updateError } = await supabase
          .from("posts")
          .update({ like_count: prevCount + 1 })
          .eq("id", reply.id);
        if (updateError) throw updateError;
      } else {
        const { error: deleteError } = await supabase
          .from("post_likes")
          .delete()
          .eq("post_id", reply.id)
          .eq("user_id", viewerUuid);
        if (deleteError) throw deleteError;

        const { error: updateError } = await supabase
          .from("posts")
          .update({ like_count: Math.max(prevCount - 1, 0) })
          .eq("id", reply.id);
        if (updateError) throw updateError;
      }
    } catch (e: any) {
      console.error("Supabase reply like toggle error:", e);

      setReplies((prev) =>
        prev.map((r) =>
          r.id === reply.id ? { ...r, liked: prevLiked, likeCount: prevCount } : r
        )
      );

      alert(
        e?.message ??
          "いいねの反映中にエラーが発生しました。時間をおいて再度お試しください。"
      );
    }
  };

  const loadReplies = useCallback(async () => {
    if (!postId || !isUuid(postId)) return;

    setLoadingReplies(true);
    setRepliesError(null);

    try {
      const { data: replyRows, error: replyErr } = await supabase
        .from("posts")
        .select(
          "id, body, created_at, author_id, author_kind, like_count, reply_count, reply_to_id, image_paths, image_urls"
        )
        .eq("reply_to_id", postId)
        .order("created_at", { ascending: true })
        .limit(200);

      if (replyErr) {
        console.error("[postDetail.replies] error:", replyErr);
        setReplies([]);
        setRepliesError(replyErr.message ?? "返信の取得に失敗しました。");
        return;
      }

      const rows = (replyRows ?? []) as DbPostRow[];
      if (!rows.length) {
        setReplies([]);
        return;
      }

      const authorIds = Array.from(
        new Set(rows.map((r) => r.author_id).filter((v): v is string => !!v))
      );

      const therapistByUserId = new Map<string, DbTherapistLite>();
      const therapistById = new Map<string, DbTherapistLite>();
      const storeByOwnerId = new Map<string, DbStoreLite>();
      const storeById = new Map<string, DbStoreLite>();

      if (authorIds.length) {
        const { data: therByUserData } = await supabase
          .from("therapists")
          .select("id, user_id, display_name, avatar_url")
          .in("user_id", authorIds);
        (therByUserData ?? []).forEach((t: any) => {
          const r = t as DbTherapistLite;
          if (r.user_id) therapistByUserId.set(r.user_id, r);
          therapistById.set(r.id, r);
        });

        const { data: therByIdData } = await supabase
          .from("therapists")
          .select("id, user_id, display_name, avatar_url")
          .in("id", authorIds);
        (therByIdData ?? []).forEach((t: any) => {
          const r = t as DbTherapistLite;
          if (r.user_id) therapistByUserId.set(r.user_id, r);
          therapistById.set(r.id, r);
        });

        const { data: storeByOwnerData } = await supabase
          .from("stores")
          .select("id, owner_user_id, name, avatar_url")
          .in("owner_user_id", authorIds);
        (storeByOwnerData ?? []).forEach((s: any) => {
          const r = s as DbStoreLite;
          if (r.owner_user_id) storeByOwnerId.set(r.owner_user_id, r);
          storeById.set(r.id, r);
        });

        const { data: storeByIdData } = await supabase
          .from("stores")
          .select("id, owner_user_id, name, avatar_url")
          .in("id", authorIds);
        (storeByIdData ?? []).forEach((s: any) => {
          const r = s as DbStoreLite;
          if (r.owner_user_id) storeByOwnerId.set(r.owner_user_id, r);
          storeById.set(r.id, r);
        });
      }

      const resolvedUserIds = new Set<string>();
      authorIds.forEach((id) => {
        if (isUuid(id)) resolvedUserIds.add(id);
      });
      therapistById.forEach((t) => {
        if (t.user_id && isUuid(t.user_id)) resolvedUserIds.add(t.user_id);
      });
      storeById.forEach((s) => {
        if (s.owner_user_id && isUuid(s.owner_user_id))
          resolvedUserIds.add(s.owner_user_id);
      });

      const userMap = new Map<string, DbUserRow>();
      const userIdsToFetch = Array.from(resolvedUserIds);
      if (userIdsToFetch.length) {
        const { data: userData } = await supabase
          .from("users")
          .select("id, name, role, avatar_url")
          .in("id", userIdsToFetch);
        (userData ?? []).forEach((u) => userMap.set(u.id, u as DbUserRow));
      }

      let likedSet = new Set<string>();
      if (viewerUuid && isUuid(viewerUuid)) {
        const replyIds = rows.map((r) => r.id);
        const { data: likeData, error: likeErr } = await supabase
          .from("post_likes")
          .select("post_id")
          .eq("user_id", viewerUuid)
          .in("post_id", replyIds);

        if (likeErr) {
          console.error("[postDetail.replies.likes] error:", likeErr);
        } else {
          likedSet = new Set(
            ((likeData ?? []) as DbPostLikeRow[]).map((r) => r.post_id)
          );
        }
      }

      const mappedAll: ReplyItem[] = rows.map((row) => {
        const rawAuthorId = row.author_id ?? "";

        const inferredKind: AuthorRole =
          row.author_kind === "therapist" ||
          therapistByUserId.has(rawAuthorId) ||
          therapistById.has(rawAuthorId)
            ? "therapist"
            : row.author_kind === "store" ||
              storeByOwnerId.has(rawAuthorId) ||
              storeById.has(rawAuthorId)
            ? "store"
            : "user";

        const therapist =
          inferredKind === "therapist"
            ? therapistById.get(rawAuthorId) ??
              therapistByUserId.get(rawAuthorId) ??
              null
            : null;

        const store =
          inferredKind === "store"
            ? storeById.get(rawAuthorId) ??
              storeByOwnerId.get(rawAuthorId) ??
              null
            : null;

        let canonicalUserId = rawAuthorId;
        if (inferredKind === "therapist") {
          if (therapist?.user_id) canonicalUserId = therapist.user_id;
        } else if (inferredKind === "store") {
          if (store?.owner_user_id) canonicalUserId = store.owner_user_id;
        }

        const user =
          isUuid(canonicalUserId) ? userMap.get(canonicalUserId) ?? null : null;

        const roleName =
          inferredKind === "therapist"
            ? (therapist?.display_name ?? "").trim() || null
            : inferredKind === "store"
            ? (store?.name ?? "").trim() || null
            : null;

        const authorName =
          roleName ||
          ((user?.name ?? "").trim() || null) ||
          (inferredKind === "store"
            ? "店舗アカウント"
            : inferredKind === "therapist"
            ? "セラピスト"
            : "名無し");

        const authorHandle =
          canonicalUserId && isUuid(canonicalUserId)
            ? toPublicHandleFromUserId(canonicalUserId)
            : null;

        const roleAvatarRaw =
          inferredKind === "therapist"
            ? therapist?.avatar_url ?? null
            : inferredKind === "store"
            ? store?.avatar_url ?? null
            : null;

        const userAvatarRaw = user?.avatar_url ?? null;
        const avatarUrl =
          resolveAvatarUrl(roleAvatarRaw) ?? resolveAvatarUrl(userAvatarRaw) ?? null;

        let profilePath: string | null = null;
        if (inferredKind === "therapist") {
          profilePath = therapist?.id
            ? `/therapist/${therapist.id}`
            : isUuid(canonicalUserId)
            ? `/mypage/${canonicalUserId}`
            : null;
        } else if (inferredKind === "store") {
          profilePath = store?.id
            ? `/store/${store.id}`
            : isUuid(canonicalUserId)
            ? `/mypage/${canonicalUserId}`
            : null;
        } else {
          profilePath = isUuid(canonicalUserId) ? `/mypage/${canonicalUserId}` : null;
        }

        const rawImages = pickRawPostImages(row as any);
        const imageUrls = resolvePostImageUrls(rawImages);

        return {
          id: row.id,
          authorId: canonicalUserId,
          authorKind: inferredKind,
          authorName,
          authorHandle,
          avatarUrl,
          profilePath,
          body: row.body ?? "",
          createdAt: row.created_at,
          timeAgoText: timeAgo(row.created_at),
          likeCount: row.like_count ?? 0,
          liked: likedSet.has(row.id),
          imageUrls,
        };
      });

      // ★ B：mute/block を replies に適用（canonical users.id 基準）
      const mutedTargets = new Set<string>();
      const blockedTargets = new Set<string>();
      relations.forEach((r) => {
        if (r.type === "mute") mutedTargets.add(r.target_id);
        if (r.type === "block") blockedTargets.add(r.target_id);
      });

      const mappedFiltered = mappedAll.filter((r) => {
        if (isUuid(r.authorId)) {
          if (mutedTargets.has(r.authorId)) return false;
          if (blockedTargets.has(r.authorId)) return false;
        }
        return true;
      });

      setReplies(mappedFiltered);
    } catch (e: any) {
      console.error("[postDetail.replies] unexpected:", e);
      setReplies([]);
      setRepliesError(e?.message ?? "返信の取得中にエラーが発生しました。");
    } finally {
      setLoadingReplies(false);
    }
  }, [postId, viewerUuid, relations]);

  useEffect(() => {
    if (!postId || !isUuid(postId)) return;
    void loadReplies();
  }, [postId, loadReplies]);

  // ★ A：返信送信（保存）
  const handleSendReply = async () => {
    if (!post || !postId || !isUuid(postId)) return;
    if (!viewerUuid || !isUuid(viewerUuid)) {
      alert("返信はログイン後に利用できます。");
      return;
    }

    const body = replyText.trim();
    if (!body) return;

    // 最低限の暴走防止（必要なら後で調整）
    if (body.length > 200) {
      alert("返信が長すぎます（200文字以内）。");
      return;
    }

    if (sendingReply) return;
    setSendingReply(true);

    // UIを壊さないために、まずローカルで reply_count を楽観更新
    const prevReplyCount = post.reply_count;
    setPost((prev) => (prev ? { ...prev, reply_count: prev.reply_count + 1 } : prev));

    try {
      // author_id / author_kind を既存の投稿形式に寄せる
      const identity = await resolveViewerAuthorIdentity(viewerUuid);

      // 1) 返信投稿を insert
      const { data: inserted, error: insErr } = await supabase
        .from("posts")
        .insert([
          {
            author_id: identity.authorId,
            author_kind: identity.authorKind,
            body,
            reply_to_id: postId,
            // image_paths は今回は無し（画像返信は次ステップで）
          },
        ])
        .select("id")
        .maybeSingle();

      if (insErr) throw insErr;

      // 2) 親投稿 reply_count を更新（軽量整合性）
      //    ※ 競合しても致命的ではない。後でRPC化するならここを置換。
      const { error: updErr } = await supabase
        .from("posts")
        .update({ reply_count: prevReplyCount + 1 })
        .eq("id", postId);

      if (updErr) {
        // 返信自体は保存できているので、ここは警告ログに留める
        console.warn("[reply] parent reply_count update failed:", updErr);
      }

      // 3) 入力クリア → 返信一覧再取得
      setReplyText("");
      await loadReplies();
    } catch (e: any) {
      console.error("[reply] send failed:", e);

      // ロールバック（親の表示だけ戻す）
      setPost((prev) =>
        prev ? { ...prev, reply_count: prevReplyCount } : prev
      );

      alert(
        e?.message ??
          "返信の送信に失敗しました。時間をおいて再度お試しください。"
      );
    } finally {
      setSendingReply(false);
    }
  };

  const handleReply = () => {
    // 返信機能はここで実装済み：入力欄へ誘導
    const el = document.getElementById("replyTextarea");
    if (el) (el as HTMLTextAreaElement).focus();
  };

  return (
    <div className="page-root">
      <AppHeader title="投稿" />

      <main className="page-main">
        <button type="button" className="back-btn" onClick={() => router.back()}>
          ← 戻る
        </button>

        {loading && <div className="page-message">読み込み中…</div>}
        {error && <div className="page-message page-error">{error}</div>}

        {!loading && post && (
          <article className="post-detail">
            <div
              className="post-header"
              role={profileClickable ? "button" : undefined}
              tabIndex={profileClickable ? 0 : -1}
              aria-label={profileClickable ? "投稿者プロフィールを見る" : undefined}
              onClick={() => {
                if (!profileClickable) return;
                goToProfile();
              }}
              onKeyDown={(e) => {
                if (!profileClickable) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  goToProfile();
                }
              }}
              style={{ cursor: profileClickable ? "pointer" : "default" }}
            >
              <AvatarCircle
                size={40}
                avatarUrl={post.avatar_url}
                displayName={post.author_name}
                alt={post.author_name}
              />

              <div className="post-author">
                <div className="post-author-name">{post.author_name}</div>
                {post.author_handle && (
                  <div className="post-author-handle">{post.author_handle}</div>
                )}
                <div className="post-time">{timeAgo(post.created_at)}</div>
              </div>
            </div>
              
            {post.image_urls.length > 0 && (
              <div
                className={`media-grid media-grid--${post.image_urls.length}`}
                aria-label="投稿画像"
              >
                {post.image_urls.map((url, idx) => (
                  <a
                    key={`${post.id}_${idx}`}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="media-tile"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="投稿画像" loading="lazy" decoding="async" />
                  </a>
                ))}
              </div>
            )}

            <div className="post-body">
              {post.body.split("\n").map((line, i) => (
                <p key={i}>{line || <span style={{ opacity: 0.3 }}>　</span>}</p>
              ))}
            </div>

            <div className="post-footer">
              <button
                type="button"
                className={`post-like-btn ${post.liked ? "liked" : ""}`}
                disabled={!viewerReady}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleToggleLike();
                }}
              >
                <span className="post-like-icon">♥</span>
                <span className="post-like-count">{post.like_count}</span>
              </button>

              <button
                type="button"
                className="post-reply-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleReply();
                }}
              >
                <span className="post-reply-icon">💬</span>
                <span className="post-reply-count">{post.reply_count}</span>
              </button>

              <div className="post-actions-offset" onClick={(e) => e.stopPropagation()}>
                <PostActionsMenu
                  open={actionsOpen}
                  onToggle={() => setActionsOpen((v) => !v)}
                  isOwner={post.canonical_user_id === viewerUuid}
                  viewerReady={viewerReady}
                  onDelete={async () => {
                    // TODO
                  }}
                  onReport={async () => {
                    // TODO
                  }}
                />
              </div>

              {!viewerReady && (
                <div className="post-footer-note">
                  いいね・通報・返信はログイン後に利用できます。
                </div>
              )}
            </div>

            {/* =========================
               返信セクション（A+B）
               ========================= */}
            <section className="replies-section" aria-label="返信一覧">
              <div className="replies-head">
                <div className="replies-title">返信</div>
                <button
                  type="button"
                  className="replies-reload"
                  onClick={() => void loadReplies()}
                  disabled={loadingReplies}
                >
                  {loadingReplies ? "更新中…" : "更新"}
                </button>
              </div>

              {/* ★ A：返信フォーム */}
              <div className="reply-compose">
                <textarea
                  id="replyTextarea"
                  className="reply-textarea"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={
                    viewerReady
                      ? "返信を書く…"
                      : "返信はログイン後に利用できます"
                  }
                  disabled={!viewerReady || sendingReply}
                  rows={3}
                />
                <div className="reply-compose-footer">
                  <div className="reply-hint">
                    {viewerReady ? (
                      <span>{replyText.trim().length}/200</span>
                    ) : (
                      <span>ログインが必要です</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="reply-send"
                    disabled={
                      !viewerReady ||
                      sendingReply ||
                      replyText.trim().length === 0 ||
                      replyText.trim().length > 200
                    }
                    onClick={() => void handleSendReply()}
                  >
                    {sendingReply ? "送信中…" : "送信"}
                  </button>
                </div>
              </div>

              {repliesError && (
                <div className="page-message page-error">{repliesError}</div>
              )}

              {!repliesError && loadingReplies && (
                <div className="page-message">返信を読み込み中…</div>
              )}

              {!loadingReplies && !repliesError && replies.length === 0 && (
                <div className="page-message">返信はまだありません。</div>
              )}

              <div className="replies-list">
                {replies.map((r) => {
                  const clickable = !!r.profilePath;
                  return (
                    <article key={r.id} className="reply-item">
                      <div
                        className="reply-head"
                        role={clickable ? "button" : undefined}
                        tabIndex={clickable ? 0 : -1}
                        onClick={() => {
                          if (!clickable) return;
                          router.push(r.profilePath!);
                        }}
                        onKeyDown={(e) => {
                          if (!clickable) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            router.push(r.profilePath!);
                          }
                        }}
                        style={{ cursor: clickable ? "pointer" : "default" }}
                      >
                        <AvatarCircle
                          size={34}
                          avatarUrl={r.avatarUrl}
                          displayName={r.authorName}
                          alt={r.authorName}
                        />
                        <div className="reply-author">
                          <div className="reply-author-name">{r.authorName}</div>
                          {r.authorHandle && (
                            <div className="reply-author-handle">
                              {r.authorHandle}
                            </div>
                          )}
                          <div className="reply-time">{r.timeAgoText}</div>
                        </div>
                      </div>

                      {r.imageUrls.length > 0 && (
                        <div
                          className={`media-grid media-grid--${r.imageUrls.length}`}
                          aria-label="返信画像"
                        >
                          {r.imageUrls.map((url, idx) => (
                            <a
                              key={`${r.id}_${idx}`}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="media-tile"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt="返信画像"
                                loading="lazy"
                                decoding="async"
                              />
                            </a>
                          ))}
                        </div>
                      )}

                      <div className="reply-body">
                        {r.body.split("\n").map((line, i) => (
                          <p key={i}>
                            {line || <span style={{ opacity: 0.3 }}>　</span>}
                          </p>
                        ))}
                      </div>

                      <div className="reply-footer">
                        <button
                          type="button"
                          className={`post-like-btn ${r.liked ? "liked" : ""}`}
                          disabled={!viewerReady}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleToggleLikeOnReply(r);
                          }}
                        >
                          <span className="post-like-icon">♥</span>
                          <span className="post-like-count">{r.likeCount}</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </article>
        )}
      </main>

      <BottomNav active="home" hasUnread={hasUnread} />

      <style jsx>{`
        .page-root {
          min-height: 100vh;
          background: var(--background, #ffffff);
          color: var(--foreground, #171717);
          display: flex;
          flex-direction: column;
        }

        .page-main {
          padding: 16px;
          padding-bottom: 64px;
        }

        .back-btn {
          border: none;
          background: transparent;
          padding: 6px 0;
          font-size: 13px;
          color: #555;
          cursor: pointer;
        }

        .post-detail {
          margin-top: 8px;
        }

        .post-header {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-bottom: 12px;
          border-radius: 10px;
          padding: 6px 4px;
        }

        .post-header:focus {
          outline: 2px solid rgba(0, 0, 0, 0.18);
          outline-offset: 2px;
        }

        .post-author-name {
          font-weight: 600;
          font-size: 14px;
        }

        .post-author-handle {
          font-size: 12px;
          color: #777;
          margin-top: 2px;
        }

        .post-time {
          font-size: 12px;
          color: #777;
          margin-top: 2px;
        }

        .post-body {
          font-size: 14px;
          line-height: 1.8;
          margin-top: 10px;
        }

        .page-message {
          font-size: 13px;
          color: #777;
          padding: 10px 0;
        }

        .page-error {
          color: #b00020;
        }

        /* =========================
           画像グリッド（Homeと同等）
           ========================= */
        .media-grid {
          margin-top: 10px;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: #f6f6f6;
          display: grid;
          gap: 2px;
        }

        .media-grid--1 {
          grid-template-columns: 1fr;
        }
        .media-grid--2 {
          grid-template-columns: 1fr 1fr;
        }
        .media-grid--3 {
          grid-template-columns: 1fr 1fr;
        }
        .media-grid--4 {
          grid-template-columns: 1fr 1fr;
        }

        .media-tile {
          position: relative;
          width: 100%;
          aspect-ratio: 1 / 1;
          background: #eee;
          display: block;
        }

        .media-tile img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        /* =========================
           フッター（いいね/返信）
           ========================= */
        .post-footer {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 10px;
        }

        .post-like-btn,
        .post-reply-btn {
          border: none;
          background: transparent;
          padding: 2px 4px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--text-sub, #777777);
          cursor: pointer;
        }

        .post-like-btn:disabled,
        .post-reply-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .post-like-btn.liked .post-like-icon {
          color: #e0245e;
        }

        .post-footer-note {
          margin-left: auto;
          font-size: 11px;
          color: var(--text-sub, #777);
        }

        .post-actions-offset {
          margin-top: 0px; /* ← ここを追加 or 調整 */
        }

        /* =========================
           返信一覧
           ========================= */
        .replies-section {
          margin-top: 18px;
          padding-top: 14px;
          border-top: 1px solid rgba(0, 0, 0, 0.06);
        }

        .replies-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 8px;
        }

        .replies-title {
          font-size: 13px;
          font-weight: 700;
        }

        .replies-reload {
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: #fff;
          border-radius: 10px;
          padding: 6px 10px;
          font-size: 12px;
          cursor: pointer;
          color: #333;                 /* ← 追加 */
          -webkit-text-fill-color: #333; /* ← iOS対策 */
        }

        .replies-reload:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* 返信フォーム */
        .reply-compose {
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 14px;
          padding: 10px;
          background: #fff;
          margin-bottom: 12px;
        }

        .reply-textarea {
          width: 100%;
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 12px;
          padding: 10px 10px;
          font-size: 13px;
          line-height: 1.6;
          resize: vertical;
          min-height: 70px;
          outline: none;
        }

        .reply-textarea:disabled {
          background: rgba(0, 0, 0, 0.03);
          color: #666;
        }

        .reply-compose-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 8px;
        }

        .reply-hint {
          font-size: 11px;
          color: var(--text-sub, #777);
        }

        .reply-send {
          border: none;
          border-radius: 12px;
          padding: 8px 12px;
          font-size: 12px;
          cursor: pointer;
          background: rgba(0, 0, 0, 0.9);
          color: #fff;
        }

        .reply-send:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .replies-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .reply-item {
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 14px;
          padding: 10px 10px;
          background: #fff;
        }

        .reply-head {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .reply-author-name {
          font-weight: 600;
          font-size: 13px;
        }

        .reply-author-handle {
          font-size: 11px;
          color: #777;
          margin-top: 2px;
        }

        .reply-time {
          font-size: 11px;
          color: #777;
          margin-top: 2px;
        }

        .reply-body {
          font-size: 13px;
          line-height: 1.7;
          margin-top: 8px;
        }

        .reply-footer {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
        }
      `}</style>
    </div>
  );
}