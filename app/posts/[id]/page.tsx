// app/posts/[id]/page.tsx
"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import PostCard from "@/components/PostCard";
import ComposerBar from "@/components/ComposerBar";

import { supabase } from "@/lib/supabaseClient";
import { timeAgo } from "@/lib/timeAgo";
import { toPublicHandleFromUserId } from "@/lib/handle";
import { ensureViewerId } from "@/lib/auth";
import { getRelationsForUser } from "@/lib/repositories/relationRepository";

import type { DbRelationRow } from "@/types/db";
import type { UiPost } from "@/lib/postFeedHydrator";
import type { UserId } from "@/types/user";

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

  image_urls: string[];

  like_count: number;
  reply_count: number;
  liked: boolean;

  reply_to_id: string | null;
};

type ReplyItem = {
  id: string;

  authorId: string;
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

/**
 * ReplyItem -> UiPost
 * - PostCard を「正」として返信UIも同一DOM/同一CSSに寄せる
 * - 返信に対するネスト返信は現状未実装のため replyCount は 0 を入れる
 */
function toUiPostFromReply(r: ReplyItem): UiPost {
  return {
    id: r.id,
    body: r.body,
    createdAt: r.createdAt,
    timeAgoText: r.timeAgoText,

    authorId: r.authorId,
    authorKind: r.authorKind,
    authorName: r.authorName,
    authorHandle: r.authorHandle,
    avatarUrl: r.avatarUrl,
    profilePath: r.profilePath,

    likeCount: r.likeCount,
    replyCount: 0,
    liked: r.liked,

    imageUrls: r.imageUrls,
  };
}

type DbPostRow = {
  id: string;
  body: string | null;
  created_at: string;
  author_id: string | null;
  author_kind: AuthorRole | null;

  like_count: number | null;
  reply_count: number | null;

  reply_to_id?: string | null;

  image_paths?: string[] | null;
  image_urls?: string[] | null;
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

type DbPostLikeRow = { post_id: string };

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
  return row?.image_paths ?? row?.image_urls ?? null;
}

async function resolveViewerUuid(): Promise<string | null> {
  try {
    const id = await ensureViewerId();
    return isUuid(id) ? id : null;
  } catch {
    return null;
  }
}

async function resolveViewerAuthorIdentity(
  viewerUuid: string
): Promise<{ authorKind: AuthorRole; authorId: string }> {
  const { data: t } = await supabase
    .from("therapists")
    .select("id, user_id")
    .eq("user_id", viewerUuid)
    .maybeSingle();

  if (t?.id) return { authorKind: "therapist", authorId: t.id };

  const { data: s } = await supabase
    .from("stores")
    .select("id, owner_user_id")
    .eq("owner_user_id", viewerUuid)
    .maybeSingle();

  if (s?.id) return { authorKind: "store", authorId: s.id };

  return { authorKind: "user", authorId: viewerUuid };
}

// DetailPost → UiPost（PostCard 用アダプタ）
function toUiPostAdapter(p: DetailPost): UiPost {
  return {
    id: p.id,
    body: p.body,
    timeAgoText: timeAgo(p.created_at),

    authorId: (p.canonical_user_id ?? "") as any,
    authorKind: p.author_role,
    authorName: p.author_name,
    authorHandle: p.author_handle,
    avatarUrl: p.avatar_url,
    profilePath: p.profile_path,

    imageUrls: p.image_urls ?? [],

    likeCount: p.like_count ?? 0,
    replyCount: p.reply_count ?? 0,
    liked: !!p.liked,
  } as UiPost;
}

export default function PostDetailPage() {
  const params = useParams();
  const router = useRouter();

  const postId = useMemo(() => {
    const raw = (params as any)?.id;
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  }, [params]);

  const [viewerUuid, setViewerUuid] = useState<UserId | null>(null);
  const viewerReady = !!viewerUuid && isUuid(String(viewerUuid));

  const [relations, setRelations] = useState<DbRelationRow[] | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [post, setPost] = useState<DetailPost | null>(null);

  // Replies
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [repliesError, setRepliesError] = useState<string | null>(null);
  const [replies, setReplies] = useState<ReplyItem[]>([]);

  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  const uiPost: UiPost | null = useMemo(() => {
    if (!post) return null;
    return toUiPostAdapter(post);
  }, [post]);

  // ========== viewer ==========
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = await resolveViewerUuid();
      if (cancelled) return;
      setViewerUuid((v as any) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ========== relations (block/mute filter) ==========
  useEffect(() => {
    let cancelled = false;

    async function loadRelations() {
      if (!viewerReady || !viewerUuid) {
        setRelations(null);
        return;
      }
      try {
        const rel = await getRelationsForUser(String(viewerUuid));
        if (cancelled) return;
        setRelations(rel ?? []);
      } catch (e) {
        if (cancelled) return;
        console.warn("[postDetail.relations] failed:", e);
        setRelations([]);
      }
    }

    void loadRelations();

    return () => {
      cancelled = true;
    };
  }, [viewerReady, viewerUuid]);

  // ========== fetch post detail ==========
  useEffect(() => {
    let cancelled = false;

    async function fetchPost() {
      if (!postId || !isUuid(postId)) {
        setError("投稿IDが不正です。");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const { data: row, error: postErr } = await supabase
          .from("posts")
          .select(
            "id, body, created_at, author_id, author_kind, like_count, reply_count, reply_to_id, image_paths, image_urls"
          )
          .eq("id", postId)
          .maybeSingle();

        if (postErr) throw postErr;
        if (!row) throw new Error("投稿が見つかりませんでした。");

        const rawAuthorId = (row as any).author_id ?? null;
        const rawKind = ((row as any).author_kind ?? "user") as AuthorRole;

        // likes (viewer)
        let liked = false;
        if (viewerUuid && isUuid(String(viewerUuid))) {
          const { data: likeRow, error: likeErr } = await supabase
            .from("post_likes")
            .select("post_id")
            .eq("user_id", String(viewerUuid))
            .eq("post_id", postId)
            .maybeSingle();

          if (likeErr) {
            console.warn("[postDetail.like] error:", likeErr);
          } else {
            liked = !!likeRow;
          }
        }

        // user / therapist / store resolve
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

        const rawImages = pickRawPostImages(row as any);
        const imageUrls = resolvePostImageUrls(rawImages);

        if (cancelled) return;

        setPost({
          id: row.id,
          body: row.body ?? "",
          created_at: row.created_at,

          raw_author_id: rawAuthorId,
          raw_author_kind: rawKind,

          canonical_user_id: canonicalUserId,

          author_role: inferredKind,
          author_name: authorName,
          author_handle: authorHandle,

          avatar_url: avatarUrl,
          profile_path: profilePath,

          image_urls: imageUrls,

          like_count: Number((row as any).like_count ?? 0),
          reply_count: Number((row as any).reply_count ?? 0),
          liked,

          reply_to_id: (row as any).reply_to_id ?? null,
        });
      } catch (e: any) {
        console.error("[postDetail.fetch] error:", e);
        if (!cancelled) {
          setError(e?.message ?? "読み込みに失敗しました。");
          setPost(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchPost();

    return () => {
      cancelled = true;
    };
  }, [postId, viewerUuid]);

  // ========== like (main post) ==========
  const toggleLikeMain = async () => {
    if (!post || !viewerReady || !viewerUuid) return;

    const nextLiked = !post.liked;
    const prevLikeCount = post.like_count;

    setPost((prev) =>
      prev
        ? {
            ...prev,
            liked: nextLiked,
            like_count: Math.max(0, prev.like_count + (nextLiked ? 1 : -1)),
          }
        : prev
    );

    try {
      if (nextLiked) {
        const { error: insErr } = await supabase.from("post_likes").insert([
          {
            user_id: String(viewerUuid),
            post_id: post.id,
          },
        ]);
        if (insErr) throw insErr;
      } else {
        const { error: delErr } = await supabase
          .from("post_likes")
          .delete()
          .eq("user_id", String(viewerUuid))
          .eq("post_id", post.id);
        if (delErr) throw delErr;
      }

      await supabase
        .from("posts")
        .update({ like_count: Math.max(0, prevLikeCount + (nextLiked ? 1 : -1)) })
        .eq("id", post.id);
    } catch (e: any) {
      console.error("[postDetail.like] failed:", e);
      setPost((prev) =>
        prev ? { ...prev, liked: !nextLiked, like_count: prevLikeCount } : prev
      );
      alert(e?.message ?? "いいねの更新に失敗しました。");
    }
  };

  // ========== replies load ==========
  const loadReplies = useCallback(async () => {
    if (!postId || !isUuid(postId)) return;

    setLoadingReplies(true);
    setRepliesError(null);

    try {
      const { data: rows, error: repErr } = await supabase
        .from("posts")
        .select(
          "id, body, created_at, author_id, author_kind, like_count, reply_count, reply_to_id, image_paths, image_urls"
        )
        .eq("reply_to_id", postId)
        .order("created_at", { ascending: true });

      if (repErr) throw repErr;

      const replyRows = (rows ?? []) as DbPostRow[];
      if (replyRows.length === 0) {
        setReplies([]);
        return;
      }

      const authorIds = Array.from(
        new Set(replyRows.map((r) => (r.author_id ?? "").trim()).filter(Boolean))
      );

      const therapistById = new Map<string, DbTherapistLite>();
      const therapistByUserId = new Map<string, DbTherapistLite>();
      const storeById = new Map<string, DbStoreLite>();
      const storeByOwnerId = new Map<string, DbStoreLite>();

      if (authorIds.length) {
        const { data: thData } = await supabase
          .from("therapists")
          .select("id, user_id, display_name, avatar_url")
          .in("id", authorIds);
        (thData ?? []).forEach((t: any) => {
          const r = t as DbTherapistLite;
          if (r.user_id) therapistByUserId.set(r.user_id, r);
          therapistById.set(r.id, r);
        });

        const { data: thByUserData } = await supabase
          .from("therapists")
          .select("id, user_id, display_name, avatar_url")
          .in("user_id", authorIds);
        (thByUserData ?? []).forEach((t: any) => {
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
      if (viewerUuid && isUuid(String(viewerUuid))) {
        const replyIds = replyRows.map((r) => r.id);
        const { data: likeData, error: likeErr } = await supabase
          .from("post_likes")
          .select("post_id")
          .eq("user_id", String(viewerUuid))
          .in("post_id", replyIds);

        if (likeErr) {
          console.error("[postDetail.replies.likes] error:", likeErr);
        } else {
          likedSet = new Set(
            ((likeData ?? []) as DbPostLikeRow[]).map((r) => r.post_id)
          );
        }
      }

      const mappedAll: ReplyItem[] = replyRows.map((row) => {
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
            ? storeById.get(rawAuthorId) ?? storeByOwnerId.get(rawAuthorId) ?? null
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
          profilePath = therapist?.id ? `/therapist/${therapist.id}` : null;
          if (!profilePath && canonicalUserId) profilePath = `/mypage/${canonicalUserId}`;
        } else if (inferredKind === "store") {
          profilePath = store?.id ? `/store/${store.id}` : null;
          if (!profilePath && canonicalUserId) profilePath = `/mypage/${canonicalUserId}`;
        } else {
          if (canonicalUserId) profilePath = `/mypage/${canonicalUserId}`;
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
          likeCount: Number((row as any).like_count ?? 0),
          liked: likedSet.has(row.id),
          imageUrls,
        };
      });

      // block/mute フィルタ（最小）
      const blockedOrMuted = new Set<string>();
      (relations ?? []).forEach((r: any) => {
        if (r?.type === "block" || r?.type === "mute") {
          if (r?.target_id) blockedOrMuted.add(String(r.target_id));
        }
      });

      const filtered = mappedAll.filter((r) => {
        if (!viewerReady) return true;
        if (blockedOrMuted.has(r.authorId)) return false;
        return true;
      });

      setReplies(filtered);
    } catch (e: any) {
      console.error("[postDetail.replies] unexpected:", e);
      setReplies([]);
      setRepliesError(e?.message ?? "返信の取得中にエラーが発生しました。");
    } finally {
      setLoadingReplies(false);
    }
  }, [postId, viewerUuid, relations, viewerReady]);

  useEffect(() => {
    if (!postId || !isUuid(postId)) return;
    void loadReplies();
  }, [postId, loadReplies]);

  // ========== like (reply) ==========
  const handleToggleLikeOnReply = async (r: ReplyItem) => {
    if (!viewerReady || !viewerUuid) return;

    const nextLiked = !r.liked;
    const prevCount = r.likeCount;

    setReplies((prev) =>
      prev.map((x) =>
        x.id === r.id
          ? {
              ...x,
              liked: nextLiked,
              likeCount: Math.max(0, x.likeCount + (nextLiked ? 1 : -1)),
            }
          : x
      )
    );

    try {
      if (nextLiked) {
        const { error: insErr } = await supabase.from("post_likes").insert([
          { user_id: String(viewerUuid), post_id: r.id },
        ]);
        if (insErr) throw insErr;
      } else {
        const { error: delErr } = await supabase
          .from("post_likes")
          .delete()
          .eq("user_id", String(viewerUuid))
          .eq("post_id", r.id);
        if (delErr) throw delErr;
      }

      await supabase
        .from("posts")
        .update({ like_count: Math.max(0, prevCount + (nextLiked ? 1 : -1)) })
        .eq("id", r.id);
    } catch (e: any) {
      console.error("[reply.like] failed:", e);
      setReplies((prev) =>
        prev.map((x) =>
          x.id === r.id ? { ...x, liked: !nextLiked, likeCount: prevCount } : x
        )
      );
      alert(e?.message ?? "いいねの更新に失敗しました。");
    }
  };

  // ========== reply send ==========
  const handleSendReply = async () => {
    if (!post || !postId || !isUuid(postId)) return;
    if (!viewerUuid || !isUuid(String(viewerUuid))) {
      alert("返信はログイン後に利用できます。");
      return;
    }

    const body = replyText.trim();
    if (!body) return;

    if (body.length > 200) {
      alert("返信が長すぎます（200文字以内）。");
      return;
    }

    if (sendingReply) return;
    setSendingReply(true);

    const prevReplyCount = post.reply_count;
    setPost((prev) => (prev ? { ...prev, reply_count: prev.reply_count + 1 } : prev));

    try {
      const identity = await resolveViewerAuthorIdentity(String(viewerUuid));

      const { error: insErr } = await supabase.from("posts").insert([
        {
          author_id: identity.authorId,
          author_kind: identity.authorKind,
          body,
          reply_to_id: postId,
        },
      ]);

      if (insErr) throw insErr;

      const { error: updErr } = await supabase
        .from("posts")
        .update({ reply_count: prevReplyCount + 1 })
        .eq("id", postId);

      if (updErr) {
        console.warn("[reply] parent reply_count update failed:", updErr);
      }

      setReplyText("");
      await loadReplies();
    } catch (e: any) {
      console.error("[reply] send failed:", e);

      setPost((prev) => (prev ? { ...prev, reply_count: prevReplyCount } : prev));

      alert(
        e?.message ??
          "返信の送信に失敗しました。時間をおいて再度お試しください。"
      );
    } finally {
      setSendingReply(false);
    }
  };

  // 返信入力にフォーカス（固定バーなので、必要ならここで軽くスクロール補助）
  const focusReplyComposer = () => {
    const el = document.getElementById("replyTextarea") as HTMLTextAreaElement | null;
    if (el) el.focus();
  };

  return (
    <div className="app-root">
      <AppHeader title="投稿" />

      <main className="app-main post-detail-main">
        {loading && <div className="text-meta">読み込み中…</div>}
        {error && <div className="text-meta text-error">{error}</div>}

        {!loading && uiPost && (
          <>
            {/* 親投稿 */}
            <PostCard
              post={uiPost}
              viewerReady={viewerReady}
              viewerUuid={viewerUuid}
              onOpenDetail={() => {
                // 詳細ページなので no-op
              }}
              onOpenProfile={(path) => {
                // 詳細ページ内の返信カードは no-op（誤タップ遷移を防ぐ）
              }}
              onToggleLike={() => void toggleLikeMain()}
              onReply={() => focusReplyComposer()}
              onDeleted={() => router.back()}
              showBadges={true}
            />

            {/* 返信セクション */}
            <section className="replies-section" aria-label="返信一覧">
              {/* 文字数/状態表示（必要最小） */}
    
              {repliesError && <div className="text-meta text-error">{repliesError}</div>}

              {!repliesError && loadingReplies && (
                <div className="text-meta">返信を読み込み中…</div>
              )}

              {!loadingReplies && !repliesError && replies.length === 0 && (
                <div className="text-meta">返信はまだありません。</div>
              )}

              <div className="replies-list">
                {replies.map((r) => {
                  const uiReply = toUiPostFromReply(r);

                  return (
                    <PostCard
                      key={r.id}
                      post={uiReply}
                      viewerReady={viewerReady}
                      viewerUuid={viewerUuid}
                      onOpenDetail={(postId) => {
                        // 返信も posts の1行なので詳細へ遷移（統一）
                        router.push(`/posts/${postId}`);
                      }}
                      onOpenProfile={(path) => {
                        if (!path) return;
                        router.push(path);
                      }}
                      onToggleLike={() => void handleToggleLikeOnReply(r)}
                      onReply={() => focusReplyComposer()}
                      onDeleted={async () => {
                        await loadReplies();
                      }}
                      showBadges={false}
                    />
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>

      {/* ★ 返信入力は messages と同じ「BottomNavの少し上に固定」 */}
      <ComposerBar
        textareaId="replyTextarea"
        value={replyText}
        onChange={setReplyText}
        onSend={handleSendReply}
        disabled={!viewerReady}
        sending={sendingReply}
        placeholder={viewerReady ? "返信を書く…" : "返信はログイン後に利用できます"}
        bottomOffset={70} // BottomNav 高さ
        maxWidth={430}
      />

      <BottomNav active="home" hasUnread={hasUnread} />

      <style jsx>{`
        .post-detail-main {
          /* ComposerBar（bottom固定）+ BottomNav 分の余白を確保 */
          padding-bottom: 160px;
        }

        /* =========================
           返信一覧
           ========================= */
        .replies-section {
          margin-top: 2px;
          padding-top: 14px;
          border-top: none;
        }
        .replies-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .replies-title {
          font-size: 13px;
          font-weight: 800;
          color: rgba(0, 0, 0, 0.78);
        }

        .replies-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .media-tile img {
          width: 100%;
          height: auto;
          display: block;
        }
      `}</style>
    </div>
  );
}