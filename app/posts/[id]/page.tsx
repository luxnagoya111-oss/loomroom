// app/posts/[id]/page.tsx
"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import AvatarCircle from "@/components/AvatarCircle";
import PostActionsMenu from "@/components/PostActionsMenu";

import { supabase } from "@/lib/supabaseClient";
import { timeAgo } from "@/lib/timeAgo";
import { toPublicHandleFromUserId } from "@/lib/handle";
import { ensureViewerId } from "@/lib/auth";
import { getRelationsForUser } from "@/lib/repositories/relationRepository";
import type { DbRelationRow } from "@/types/db";

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
 * viewerUuid（users.id）
 */
async function resolveViewerUuid(): Promise<string | null> {
  try {
    const id = await ensureViewerId();
    return isUuid(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * 返信 insert 用に viewer の author_id / author_kind を解決
 * - therapist: therapists.user_id = viewerUuid があれば author_kind="therapist", author_id=therapists.id
 * - store: stores.owner_user_id = viewerUuid があれば author_kind="store", author_id=stores.id
 * - else: user
 */
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

export default function PostDetailPage() {
  const params = useParams();
  const router = useRouter();

  const postId = useMemo(() => {
    const raw = (params as any)?.id;
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  }, [params]);

  const [viewerUuid, setViewerUuid] = useState<string | null>(null);
  const viewerReady = !!viewerUuid && isUuid(viewerUuid);

  const [relations, setRelations] = useState<DbRelationRow[] | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [post, setPost] = useState<DetailPost | null>(null);

  const [actionsOpen, setActionsOpen] = useState(false);

  // Replies
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [repliesError, setRepliesError] = useState<string | null>(null);
  const [replies, setReplies] = useState<ReplyItem[]>([]);

  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  // ========== viewer ==========
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = await resolveViewerUuid();
      if (cancelled) return;
      setViewerUuid(v);
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
        const rel = await getRelationsForUser(viewerUuid);
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
            "id, body, created_at, author_id, author_kind, like_count, reply_count, reply_to_id, image_paths, image_urls, imageUrls"
          )
          .eq("id", postId)
          .maybeSingle();

        if (postErr) throw postErr;
        if (!row) throw new Error("投稿が見つかりませんでした。");

        const rawAuthorId = (row as any).author_id ?? null;
        const rawKind = ((row as any).author_kind ?? "user") as AuthorRole;

        // likes (viewer)
        let liked = false;
        if (viewerUuid && isUuid(viewerUuid)) {
          const { data: likeRow, error: likeErr } = await supabase
            .from("post_likes")
            .select("post_id")
            .eq("user_id", viewerUuid)
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

        // 画像
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

  const profileClickable = !!post?.profile_path;

  const goToProfile = () => {
    if (!post?.profile_path) return;
    router.push(post.profile_path);
  };

  // ========== like (main post) ==========
  const handleToggleLike = async () => {
    if (!post || !viewerReady || !viewerUuid) return;

    const nextLiked = !post.liked;
    const prevLikeCount = post.like_count;

    // optimistic
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
            user_id: viewerUuid,
            post_id: post.id,
          },
        ]);
        if (insErr) throw insErr;
      } else {
        const { error: delErr } = await supabase
          .from("post_likes")
          .delete()
          .eq("user_id", viewerUuid)
          .eq("post_id", post.id);
        if (delErr) throw delErr;
      }

      // count sync（軽量）
      await supabase
        .from("posts")
        .update({ like_count: Math.max(0, prevLikeCount + (nextLiked ? 1 : -1)) })
        .eq("id", post.id);
    } catch (e: any) {
      console.error("[postDetail.like] failed:", e);
      // rollback
      setPost((prev) =>
        prev
          ? {
              ...prev,
              liked: !nextLiked,
              like_count: prevLikeCount,
            }
          : prev
      );
      alert(e?.message ?? "いいねの更新に失敗しました。");
    }
  };

  const handleReply = () => {
    const el = document.getElementById("replyTextarea");
    if (el) (el as HTMLTextAreaElement).focus();
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
          "id, body, created_at, author_id, author_kind, like_count, reply_count, reply_to_id, image_paths, image_urls, imageUrls"
        )
        .eq("reply_to_id", postId)
        .order("created_at", { ascending: true });

      if (repErr) throw repErr;

      const replyRows = (rows ?? []) as DbPostRow[];
      if (replyRows.length === 0) {
        setReplies([]);
        return;
      }

      // author_ids 集める
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
      if (viewerUuid && isUuid(viewerUuid)) {
        const replyIds = replyRows.map((r) => r.id);
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
          ? { ...x, liked: nextLiked, likeCount: Math.max(0, x.likeCount + (nextLiked ? 1 : -1)) }
          : x
      )
    );

    try {
      if (nextLiked) {
        const { error: insErr } = await supabase.from("post_likes").insert([
          { user_id: viewerUuid, post_id: r.id },
        ]);
        if (insErr) throw insErr;
      } else {
        const { error: delErr } = await supabase
          .from("post_likes")
          .delete()
          .eq("user_id", viewerUuid)
          .eq("post_id", r.id);
        if (delErr) throw delErr;
      }

      await supabase
        .from("posts")
        .update({ like_count: Math.max(0, prevCount + (nextLiked ? 1 : -1)) })
        .eq("id", r.id);
    } catch (e: any) {
      console.error("[reply.like] failed:", e);
      // rollback
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
    if (!viewerUuid || !isUuid(viewerUuid)) {
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
      const identity = await resolveViewerAuthorIdentity(viewerUuid);

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

  // ========== PostActionsMenu ==========
  const handleDeletePost = async () => {
    if (!post) return;
    if (!viewerReady || !viewerUuid) {
      alert("削除はログイン後に利用できます。");
      return;
    }
    if (post.canonical_user_id !== viewerUuid) {
      alert("この投稿は削除できません。");
      return;
    }

    const ok = window.confirm("この投稿を削除しますか？");
    if (!ok) return;

    try {
      // 依存関係：like を先に削除（FKがある場合の保険）
      await supabase.from("post_likes").delete().eq("post_id", post.id);

      const { error: delErr } = await supabase.from("posts").delete().eq("id", post.id);
      if (delErr) throw delErr;

      router.back();
    } catch (e: any) {
      console.error("[postDetail.delete] failed:", e);
      alert(e?.message ?? "削除に失敗しました。");
    } finally {
      setActionsOpen(false);
    }
  };

  const handleReportPost = async () => {
    if (!post) return;
    if (!viewerReady || !viewerUuid) {
      alert("通報はログイン後に利用できます。");
      return;
    }

    const ok = window.confirm("この投稿を通報しますか？");
    if (!ok) return;

    try {
      // reports テーブルがある前提（既存実装に合わせて最小）
      const { error: repErr } = await supabase.from("reports").insert([
        {
          reporter_id: viewerUuid,
          target_kind: "post",
          target_id: post.id,
          reason: "user_report",
        },
      ]);
      if (repErr) throw repErr;

      alert("通報しました。ありがとうございます。");
    } catch (e: any) {
      console.error("[postDetail.report] failed:", e);
      alert(e?.message ?? "通報に失敗しました。");
    } finally {
      setActionsOpen(false);
    }
  };

  return (
    <div className="app-root">
      <AppHeader title="投稿" />

      <main className="app-main">
        <button type="button" className="back-btn" onClick={() => router.back()}>
          ← 戻る
        </button>

        {loading && <div className="text-meta">読み込み中…</div>}
        {error && <div className="text-meta text-error">{error}</div>}

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
                <div className="post-name">{post.author_name}</div>
                {post.author_handle && (
                  <div className="post-username">{post.author_handle}</div>
                )}
                <div className="post-meta">{timeAgo(post.created_at)}</div>
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

            {/* ===== PostCard.tsx と同じ class に統一 ===== */}
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

              <div className="post-menu-wrap" onClick={(e) => e.stopPropagation()}>
                <PostActionsMenu
                  open={actionsOpen}
                  onToggle={() => setActionsOpen((v) => !v)}
                  isOwner={post.canonical_user_id === viewerUuid}
                  viewerReady={viewerReady}
                  onDelete={handleDeletePost}
                  onReport={handleReportPost}
                />
              </div>
            </div>

            {!viewerReady && (
              <div className="feed-message">
                いいね・通報・返信はログイン後に利用できます。
              </div>
            )}

            {/* =========================
               返信セクション
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

              <div className="reply-compose">
                <textarea
                  id="replyTextarea"
                  className="reply-textarea"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={viewerReady ? "返信を書く…" : "返信はログイン後に利用できます"}
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

              {repliesError && <div className="text-meta text-error">{repliesError}</div>}

              {!repliesError && loadingReplies && (
                <div className="text-meta">返信を読み込み中…</div>
              )}

              {!loadingReplies && !repliesError && replies.length === 0 && (
                <div className="text-meta">返信はまだありません。</div>
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
                            <div className="reply-author-handle">{r.authorHandle}</div>
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
                              <img src={url} alt="返信画像" loading="lazy" decoding="async" />
                            </a>
                          ))}
                        </div>
                      )}

                      <div className="reply-body">
                        {r.body.split("\n").map((line, i) => (
                          <p key={i}>{line || <span style={{ opacity: 0.3 }}>　</span>}</p>
                        ))}
                      </div>

                      {/* Reply いいねも PostCard と揃える */}
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

        .media-tile img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        /* PostCard と同じクラス前提（global/postCard側と競合しない最小だけ） */
        .post-menu-wrap {
          margin-left: auto;
          display: flex;
          align-items: center;
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
          color: #333;
          -webkit-text-fill-color: #333;
        }

        .replies-reload:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

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