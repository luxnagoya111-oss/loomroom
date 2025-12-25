// app/store/[id]/page.tsx
"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import AvatarCircle from "@/components/AvatarCircle";
import PostCard from "@/components/PostCard";
import ProfileHero from "@/components/ProfileHero";

import { supabase } from "@/lib/supabaseClient";
import { timeAgo } from "@/lib/timeAgo";
import { ensureViewerId } from "@/lib/auth";
import { toPublicHandleFromUserId } from "@/lib/handle";

import {
  getRelation,
  setRelation as setRelationOnServer,
  toRelationFlags,
  type RelationFlags,
} from "@/lib/repositories/relationRepository";

import {
  fetchPostsByAuthorIds,
  fetchLikedPostIdsForUser,
  toggleLike as toggleLikeOnServer,
  reportPost,
  type DbPostRow as RepoPostRow,
} from "@/lib/repositories/postRepository";

import {
  resolveAvatarUrl,
  pickRawPostImages,
  resolvePostImageUrls,
} from "@/lib/postMedia";

import type { UserId } from "@/types/user";
import type { UiPost } from "@/lib/postFeedHydrator";
import { getConnectionCounts } from "@/lib/repositories/connectionRepository";

// ==============================
// 型定義（Supabase から取る最低限）
// ==============================
type DbStoreRow = {
  id: string;
  owner_user_id: string | null;
  name: string | null;
  area: string | null;
  description: string | null;
  website_url?: string | null;
  x_url?: string | null;
  twicas_url?: string | null;
  line_url?: string | null;
  avatar_url?: string | null;
};

type DbUserRow = {
  id: string;
  name: string | null;
  avatar_url: string | null;
  role?: string | null;
};

type DbTherapistRow = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

// ==============================
// util
// ==============================
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

function safeNumber(v: any, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * URLとして使う前に「それっぽいゴミ」を弾く（avatars bucket の root など）
 */
function looksValidAvatarUrl(v: string | null | undefined): boolean {
  const s = (v ?? "").trim();
  if (!s) return false;

  // 例: ".../storage/v1/object/public/avatars" で終わるだけのURLは無効
  if (s.includes("/storage/v1/object/public/avatars")) {
    if (/\/public\/avatars\/?$/i.test(s)) return false;
  }
  return true;
}

// 店舗IDがslugだった時代のフォールバック（ラベルだけ）
const AREA_LABEL_MAP: Record<string, string> = {
  lux: "中部（名古屋・東海エリア）",
  tokyo: "関東（東京近郊）",
  osaka: "近畿（大阪・京都など）",
};

// 未読バッジは固定デモ
const hasUnread = true;

type TherapistHit = {
  id: string; // therapists.id
  userId: string | null; // users.id(uuid)
  displayName: string;
  avatarUrl: string | null;
  handle: string; // @xxxxxx
};

type RelatedLink = { label: string; href: string };

export default function StoreProfilePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const storeId = (params?.id as string) || "store";

  // slug時代のフォールバック（表示だけ）
  const fallbackSlug =
    storeId === "lux" || storeId === "loomroom" ? storeId : "lux";

  const initialStoreName =
    fallbackSlug === "lux"
      ? "LuX nagoya"
      : fallbackSlug === "loomroom"
      ? "LRoom"
      : "LRoom 提携サロン";

  const initialAreaLabel =
    AREA_LABEL_MAP[fallbackSlug] || "全国（オンライン案内中心）";

  // ==============================
  // state
  // ==============================
  const [storeName, setStoreName] = useState<string>(initialStoreName);

  /**
   * handle は「owner_user_id(uuid) → @xxxxxx」に統一
   */
  const [storeHandle, setStoreHandle] = useState<string>("");

  const [areaLabel, setAreaLabel] = useState<string>(initialAreaLabel);
  const [storeProfileText, setStoreProfileText] = useState<string | null>(null);

  // 公式リンクはページからは削除（ProfileHero の relatedLinks に集約）
  const [websiteUrl, setWebsiteUrl] = useState<string | null>(null);
  const [xUrl, setXUrl] = useState<string | null>(null);
  const [twicasUrl, setTwicasUrl] = useState<string | null>(null);
  const [lineUrl, setLineUrl] = useState<string | null>(null);

  const [loadingProfile, setLoadingProfile] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Supabase Auth（uuid会員）
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  // viewer uuid（DB操作に使う。未ログインなら null）
  const [viewerUuid, setViewerUuid] = useState<UserId | null>(null);
  const viewerReady = !!viewerUuid && isUuid(viewerUuid);

  // relations用（店舗オーナー users.id）
  const [storeOwnerUserId, setStoreOwnerUserId] = useState<string | null>(null);

  // 店舗アバター（stores.avatar_url）
  const [storeAvatarUrl, setStoreAvatarUrl] = useState<string | null>(null);

  // オーナーのユーザーアバター（users.avatar_url fallback）
  const [ownerAvatarUrl, setOwnerAvatarUrl] = useState<string | null>(null);

  // Owner 判定は Auth uuid を正とする
  const isOwner =
    !!authUserId &&
    !!storeOwnerUserId &&
    isUuid(authUserId) &&
    isUuid(storeOwnerUserId) &&
    authUserId === storeOwnerUserId;

  const [relations, setRelations] = useState<RelationFlags>({
    following: false,
    muted: false,
    blocked: false,
  });

  // connections 用のカウント（mypage と同一：表示対象 users.id を正）
  const [followingCount, setFollowingCount] = useState<number>(0);
  const [followersCount, setFollowersCount] = useState<number>(0);
  const [loadingCounts, setLoadingCounts] = useState<boolean>(false);

  // 在籍セラピスト（DB）
  const [therapists, setTherapists] = useState<TherapistHit[]>([]);

  // 投稿（★PostCard基準に統一）
  const [posts, setPosts] = useState<UiPost[]>([]);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [loadingPosts, setLoadingPosts] = useState<boolean>(false);

  // menu（現状は保持のみ）
  const [menuPostId, setMenuPostId] = useState<string | null>(null);

  // 在籍申請
  const [canApplyMembership, setCanApplyMembership] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyDone, setApplyDone] = useState(false);

  // Auth 初期化（authUserId + viewerUuid）
  useEffect(() => {
    if (typeof window === "undefined") return;

    supabase.auth
      .getUser()
      .then(({ data }) => setAuthUserId(data.user?.id ?? null))
      .catch(() => setAuthUserId(null));

    ensureViewerId()
      .then((uid) => setViewerUuid(uid))
      .catch(() => setViewerUuid(null));
  }, []);

  // relation 復元（uuid会員同士のみ）
  useEffect(() => {
    if (isOwner) {
      setRelations({ following: false, muted: false, blocked: false });
      return;
    }

    if (!isUuid(authUserId) || !isUuid(storeOwnerUserId)) {
      setRelations({ following: false, muted: false, blocked: false });
      return;
    }
    if (authUserId === storeOwnerUserId) return;

    let cancelled = false;
    (async () => {
      const row = await getRelation(
        authUserId as UserId,
        storeOwnerUserId as UserId
      );
      if (cancelled) return;
      setRelations(toRelationFlags(row));
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId, storeOwnerUserId, isOwner]);

  // フォロー中 / フォロワー数（mypage と同一：owner users.id を正）
  useEffect(() => {
    let cancelled = false;

    async function loadCounts(uid: string) {
      if (!isUuid(uid)) {
        setFollowingCount(0);
        setFollowersCount(0);
        setLoadingCounts(false);
        return;
      }

      setLoadingCounts(true);
      try {
        const { followers, follows } = await getConnectionCounts(uid);
        if (cancelled) return;

        setFollowingCount(follows);
        setFollowersCount(followers);
      } catch (e) {
        if (cancelled) return;
        console.error("[StoreProfile] count unexpected error:", e);
        setFollowingCount(0);
        setFollowersCount(0);
      } finally {
        if (!cancelled) setLoadingCounts(false);
      }
    }

    if (storeOwnerUserId) void loadCounts(storeOwnerUserId);
    else {
      setFollowingCount(0);
      setFollowersCount(0);
      setLoadingCounts(false);
    }

    return () => {
      cancelled = true;
    };
  }, [storeOwnerUserId]);

  // 在籍申請ボタン表示判定（uuid会員の therapist のみ）
  useEffect(() => {
    let cancelled = false;

    const checkEligibility = async () => {
      if (!isUuid(authUserId)) {
        setCanApplyMembership(false);
        return;
      }
      if (authUserId === storeOwnerUserId) {
        setCanApplyMembership(false);
        return;
      }

      const { data: userRow } = await supabase
        .from("users")
        .select("role")
        .eq("id", authUserId)
        .maybeSingle<DbUserRow>();

      if (cancelled || (userRow as any)?.role !== "therapist") {
        setCanApplyMembership(false);
        return;
      }

      const { data: therapistRow } = await supabase
        .from("therapists")
        .select("store_id")
        .eq("user_id", authUserId)
        .maybeSingle();

      if (cancelled) return;

      setCanApplyMembership(
        !!therapistRow && (therapistRow as any).store_id == null
      );
    };

    void checkEligibility();
    return () => {
      cancelled = true;
    };
  }, [authUserId, storeOwnerUserId]);

  // フォロー/ミュート/ブロック（uuid会員同士のみ）
  const handleToggleFollow = async () => {
    if (isOwner) return;
    if (!isUuid(authUserId) || !isUuid(storeOwnerUserId)) return;
    if (authUserId === storeOwnerUserId) return;

    const nextEnabled = !relations.following;

    const ok = await setRelationOnServer({
      userId: authUserId as UserId,
      targetId: storeOwnerUserId as UserId,
      type: nextEnabled ? "follow" : null,
    });
    if (!ok) return;

    setRelations({ following: nextEnabled, muted: false, blocked: false });

    // 楽観更新：対象(owner)の followers が増減
    setFollowersCount((prev) => {
      const next = nextEnabled ? prev + 1 : prev - 1;
      return next < 0 ? 0 : next;
    });
  };

  const handleToggleMute = async () => {
    if (isOwner) return;
    if (!isUuid(authUserId) || !isUuid(storeOwnerUserId)) return;
    if (authUserId === storeOwnerUserId) return;

    const nextEnabled = !relations.muted;

    const ok = await setRelationOnServer({
      userId: authUserId as UserId,
      targetId: storeOwnerUserId as UserId,
      type: nextEnabled ? "mute" : null,
    });
    if (!ok) return;

    setRelations({ following: false, muted: nextEnabled, blocked: false });
  };

  const handleToggleBlock = async () => {
    if (isOwner) return;
    if (!isUuid(authUserId) || !isUuid(storeOwnerUserId)) return;
    if (authUserId === storeOwnerUserId) return;

    const nextEnabled = !relations.blocked;

    if (nextEnabled) {
      const ok = window.confirm(
        "この店舗アカウントをブロックしますか？\nタイムラインやDMからも非表示になります。"
      );
      if (!ok) return;
    }

    const ok = await setRelationOnServer({
      userId: authUserId as UserId,
      targetId: storeOwnerUserId as UserId,
      type: nextEnabled ? "block" : null,
    });
    if (!ok) return;

    setRelations({ following: false, muted: false, blocked: nextEnabled });
  };

  // 在籍申請：RPC直呼び（401回避）
  const handleApplyMembership = async () => {
    try {
      setApplyLoading(true);

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      const authId = userData?.user?.id ?? null;

      if (userErr || !authId) {
        throw new Error("unauthorized");
      }

      const { error } = await supabase.rpc("rpc_create_therapist_store_request", {
        p_store_id: storeId,
      });

      if (error) {
        if (String((error as any).message || "").includes("already pending")) {
          setApplyDone(true);
          return;
        }
        throw new Error((error as any).message || "申請に失敗しました");
      }

      setApplyDone(true);
    } catch (e: any) {
      alert(e?.message ?? "在籍申請に失敗しました");
    } finally {
      setApplyLoading(false);
    }
  };

  // ==============================
  // 店舗プロフィール + 投稿（UiPost化 + PostCard利用）
  // ==============================
  useEffect(() => {
    let cancelled = false;

    const fetchProfileAndPosts = async () => {
      try {
        setLoadingProfile(true);
        setProfileError(null);
        setLoadingPosts(true);
        setPostsError(null);

        // 1) stores
        const { data: storeRow, error: sError } = await supabase
          .from("stores")
          .select(
            "id, owner_user_id, name, area, description, website_url, x_url, twicas_url, line_url, avatar_url"
          )
          .eq("id", storeId)
          .maybeSingle<DbStoreRow>();

        if (cancelled) return;

        if (sError) {
          console.error("[StoreProfile] store fetch error:", sError);
          setProfileError(
            (sError as any)?.message ?? "店舗プロフィールの取得に失敗しました。"
          );
          setPosts([]);
          return;
        }
        if (!storeRow) {
          setProfileError("店舗プロフィールが見つかりませんでした。");
          setPosts([]);
          return;
        }

        const row = storeRow as DbStoreRow;

        if (row.name?.trim()) setStoreName(row.name.trim());
        if (row.area?.trim()) setAreaLabel(row.area.trim());
        setStoreProfileText(row.description?.trim()?.length ? row.description : null);

        // related links 用（ページ側では表示しない）
        setWebsiteUrl(row.website_url?.trim() || null);
        setXUrl(row.x_url?.trim() || null);
        setTwicasUrl(row.twicas_url?.trim() || null);
        setLineUrl(row.line_url?.trim() || null);

        setStoreOwnerUserId(row.owner_user_id ?? null);

        // handle は owner_user_id から @6桁
        setStoreHandle(toPublicHandleFromUserId(row.owner_user_id) ?? "");

        // 店舗アイコン（DB正）
        const storeAvatarResolved = looksValidAvatarUrl(row.avatar_url ?? null)
          ? resolveAvatarUrl(row.avatar_url ?? null)
          : null;
        setStoreAvatarUrl(storeAvatarResolved);

        // 2) users（avatar fallback用）
        let ownerUser: DbUserRow | null = null;
        if (row.owner_user_id) {
          const { data: userRow, error: uError } = await supabase
            .from("users")
            .select("id, name, avatar_url")
            .eq("id", row.owner_user_id)
            .maybeSingle<DbUserRow>();

          if (cancelled) return;

          if (uError) {
            console.error("[StoreProfile] owner user fetch error:", uError);
          } else if (userRow) {
            ownerUser = userRow;
            const ownerAvatarResolved = looksValidAvatarUrl(userRow.avatar_url)
              ? resolveAvatarUrl(userRow.avatar_url)
              : null;
            setOwnerAvatarUrl(ownerAvatarResolved);
          }
        }

        // 3) posts（author_id 揺れ対策：owner_user_id + storeId を候補に）
        const authorIds: string[] = [];
        if (row.owner_user_id) authorIds.push(row.owner_user_id);
        if (storeId) authorIds.push(storeId);

        if (!authorIds.length) {
          setPosts([]);
          return;
        }

        const postRows = await fetchPostsByAuthorIds({
          authorIds,
          excludeReplies: true,
          limit: 50,
        });

        if (cancelled) return;

        // 4) likedIds（viewerReady のときだけ）
        const likedSet =
          viewerReady && viewerUuid
            ? await fetchLikedPostIdsForUser(viewerUuid)
            : new Set<string>();

        if (cancelled) return;

        const ownerAvatarResolved =
          ownerUser && looksValidAvatarUrl(ownerUser.avatar_url)
            ? resolveAvatarUrl(ownerUser.avatar_url)
            : null;

        // 表示に使う店舗アバターは「stores.avatar_url 優先 → owner users.avatar_url」
        const effectiveStoreAvatarUrl =
          storeAvatarResolved || ownerAvatarResolved || null;

        const profilePath = `/store/${storeId}`;
        const authorId = row.owner_user_id ?? storeId; // UiPost必須対策（uuid優先）

        const mapped: UiPost[] = (postRows ?? []).map((p: RepoPostRow) => {
          const rawImages = pickRawPostImages(p as any);
          const imageUrls = resolvePostImageUrls(rawImages);

          return {
            id: p.id,
            authorId: authorId ?? "",
            createdAt: (p as any).created_at,
            body: (p as any).body ?? "",
            imageUrls,

            authorKind: "store",
            authorName: (row.name?.trim() || initialStoreName) as string,
            authorHandle: toPublicHandleFromUserId(row.owner_user_id) ?? "",
            avatarUrl: effectiveStoreAvatarUrl,
            profilePath,

            timeAgoText: timeAgo((p as any).created_at),

            likeCount: safeNumber((p as any).like_count, 0),
            replyCount: safeNumber((p as any).reply_count, 0),

            liked: likedSet.has(p.id),
          } as UiPost;
        });

        setPosts(mapped);
      } catch (e: any) {
        if (cancelled) return;
        console.error("[StoreProfile] unexpected error:", e);
        setProfileError(
          e?.message ?? "店舗プロフィールの取得中に不明なエラーが発生しました。"
        );
        setPostsError(
          e?.message ??
            "お店の投稿の取得中に不明なエラーが発生しました。時間をおいて再度お試しください。"
        );
        setPosts([]);
      } finally {
        if (!cancelled) {
          setLoadingProfile(false);
          setLoadingPosts(false);
        }
      }
    };

    void fetchProfileAndPosts();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, viewerReady, viewerUuid]);

  // 在籍セラピスト（DB）
  useEffect(() => {
    let cancelled = false;

    const loadTherapists = async () => {
      try {
        const { data, error } = await supabase
          .from("therapists")
          .select("id, user_id, display_name, avatar_url, store_id")
          .eq("store_id", storeId);

        if (cancelled) return;
        if (error) throw error;

        const rows: TherapistHit[] = (data ?? []).map((t: any) => {
          const raw = (t as DbTherapistRow).avatar_url ?? null;
          const resolved = looksValidAvatarUrl(raw)
            ? resolveAvatarUrl(raw)
            : null;

          const displayName =
            ((t as DbTherapistRow).display_name ?? "").trim() || "セラピスト";
          const userId = (t as DbTherapistRow).user_id ?? null;

          return {
            id: String((t as DbTherapistRow).id),
            userId,
            displayName,
            avatarUrl: resolved,
            handle: toPublicHandleFromUserId(userId) ?? "",
          };
        });

        setTherapists(rows);
      } catch (e) {
        console.warn("[StoreProfile] therapists load failed:", e);
        setTherapists([]);
      }
    };

    void loadTherapists();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  // ==============================
  // PostCard handlers（Therapist と同型）
  // ==============================
  const handleOpenDetail = useCallback(
    (postId: string) => {
      router.push(`/posts/${postId}`);
    },
    [router]
  );

  const handleOpenProfile = useCallback(
    (path: string | null) => {
      if (!path) return;
      router.push(path);
    },
    [router]
  );

  const handleReply = useCallback(
    (postId: string) => {
      router.push(`/posts/${postId}`);
    },
    [router]
  );

  const handleToggleLike = useCallback(
    async (post: UiPost) => {
      if (!viewerReady || !viewerUuid || !isUuid(viewerUuid)) return;

      const nextLiked = !post.liked;

      // optimistic
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? {
                ...p,
                liked: nextLiked,
                likeCount: Math.max(p.likeCount + (nextLiked ? 1 : -1), 0),
              }
            : p
        )
      );

      const res = await toggleLikeOnServer({
        postId: post.id,
        userId: viewerUuid,
        nextLiked,
        currentLikeCount: Math.max(post.likeCount, 0),
      });

      if (!res.ok) {
        // rollback
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? { ...p, liked: post.liked, likeCount: post.likeCount }
              : p
          )
        );
        return;
      }

      // server truth
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, likeCount: res.likeCount, liked: nextLiked }
            : p
        )
      );
    },
    [viewerReady, viewerUuid]
  );

  const handleOpenMenu = useCallback((postId: string) => {
    setMenuPostId((prev) => (prev === postId ? null : postId));
  }, []);

  const handleReport = useCallback(
    async (postId: string) => {
      if (!viewerReady || !viewerUuid || !isUuid(viewerUuid)) {
        alert("通報はログイン後にご利用いただけます。");
        return;
      }
      const ok = window.confirm("この投稿を通報しますか？");
      if (!ok) return;

      const done = await reportPost({
        postId,
        reporterId: viewerUuid,
        reason: null,
      });
      if (done) alert("通報を受け付けました。ご協力ありがとうございます。");
      else alert("通報に失敗しました。時間をおいて再度お試しください。");
      setMenuPostId(null);
    },
    [viewerReady, viewerUuid]
  );

  // ==============================
  // 表示計算（ProfileHero 用）
  // ==============================
  const storeInitial = storeName?.trim()?.charAt(0)?.toUpperCase() || "?";
  const effectiveStoreAvatarUrl = storeAvatarUrl || ownerAvatarUrl || null;

  // Relation UI は uuid会員同士 + 自分以外 のときだけ
  const canShowRelationUi =
    !isOwner && isUuid(authUserId) && isUuid(storeOwnerUserId);

  // DM は uuidログイン済み + 相手uuid + 自分以外 + ブロックしてない ときだけ
  const canShowDmButton =
    !isOwner && !relations.blocked && isUuid(authUserId) && isUuid(storeOwnerUserId);

  // counts 表示は「対象がuuidなら表示」（ログイン不要）
  const canShowCounts = isUuid(storeOwnerUserId);

  const followingHref = canShowCounts
    ? `/connections/${storeOwnerUserId}?tab=following`
    : "#";
  const followerHref = canShowCounts
    ? `/connections/${storeOwnerUserId}?tab=followers`
    : "#";

  // ProfileHero の編集導線（店舗は console）
  const editHref = `/store/${storeId}/console`;

  const relatedLinks: RelatedLink[] = useMemo(() => {
    const links: RelatedLink[] = [];
    if (websiteUrl) links.push({ label: "公式サイトを見る", href: websiteUrl });
    if (xUrl) links.push({ label: "X（旧Twitter）", href: xUrl });
    if (twicasUrl) links.push({ label: "ツイキャス", href: twicasUrl });
    if (lineUrl) links.push({ label: "公式LINE", href: lineUrl });
    return links;
  }, [websiteUrl, xUrl, twicasUrl, lineUrl]);

  return (
    <div className="app-shell">
      <AppHeader title={storeName} subtitle={storeHandle || ""} showBack={true} />

      <main className="app-main">
        {profileError && (
          <div className="error-strip">
            店舗情報の読み込みに失敗しました：{profileError}
          </div>
        )}

        {/* ★ Heroは共通コンポーネントに統一（公式リンクは relatedLinks に寄せる） */}
        <ProfileHero
          displayName={storeName}
          handle={storeHandle || ""}
          avatarUrl={effectiveStoreAvatarUrl}
          avatarInitial={storeInitial}
          roleLabel="店舗"
          areaLabel={areaLabel || "未設定"}
          intro={storeProfileText ?? null}
          loadingProfile={loadingProfile}
          postsCount={posts.length}
          canShowCounts={canShowCounts}
          loadingCounts={loadingCounts}
          followingCount={canShowCounts ? followingCount : null}
          followerCount={canShowCounts ? followersCount : null}
          followingHref={followingHref}
          followerHref={followerHref}
          canShowDm={!!(canShowDmButton && storeOwnerUserId)}
          targetUserId={storeOwnerUserId ?? ""}
          canEdit={isOwner}
          editHref={editHref}
          canShowRelationUi={canShowRelationUi}
          relations={relations}
          onToggleFollow={handleToggleFollow}
          onToggleMute={handleToggleMute}
          onToggleBlock={handleToggleBlock}
          relatedLinks={relatedLinks}
        />

        {/* ★ Hero直下に追加要素（在籍申請など） */}
        {canApplyMembership && (
          <section className="hero-extra">
            <button
              type="button"
              disabled={applyLoading || applyDone}
              onClick={handleApplyMembership}
              className="apply-btn"
            >
              {applyDone
                ? "在籍申請済み"
                : applyLoading
                ? "申請中…"
                : "この店舗に在籍申請する"}
            </button>
          </section>
        )}

        {/* 在籍セラピスト一覧（既存UIを維持） */}
        <section className="surface-card store-card">
          <h2 className="store-section-title">在籍セラピスト</h2>

          {therapists.length === 0 ? (
            <p className="store-caption">
              まだ LRoom 上では在籍セラピストが登録されていません。
            </p>
          ) : (
            <ul className="therapist-list">
              {therapists.map((t) => (
                <li key={t.id} className="therapist-item">
                  <Link
                    href={`/therapist/${t.id}`}
                    className="therapist-link no-link-style"
                  >
                    <AvatarCircle
                      className="therapist-avatar"
                      size={40}
                      avatarUrl={t.avatarUrl}
                      displayName={t.displayName}
                      alt=""
                    />

                    <div className="therapist-item-main">
                      <div className="therapist-item-name">{t.displayName}</div>
                      <div className="therapist-item-id">{t.handle || ""}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 投稿（Therapistページの見出し/空表示のトーンに寄せる） */}
        <section className="store-posts-section">
          <h2 className="profile-section-title">投稿</h2>

          {loadingPosts && <div className="empty-hint">投稿を読み込んでいます…</div>}
          {postsError && !loadingPosts && (
            <div className="empty-hint" style={{ color: "#b00020" }}>
              {postsError}
            </div>
          )}
          {!loadingPosts && !postsError && posts.length === 0 && (
            <div className="empty-hint">まだ投稿はありません。</div>
          )}

          {!loadingPosts && !postsError && posts.length > 0 && (
            <div className="feed-list">
              {posts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  viewerReady={viewerReady}
                  viewerUuid={viewerUuid}
                  onOpenDetail={handleOpenDetail}
                  onOpenProfile={handleOpenProfile}
                  onToggleLike={handleToggleLike}
                  onReply={handleReply}
                  onDeleted={(postId) => {
                    setPosts((prev) => prev.filter((x) => x.id !== postId));
                  }}
                  showBadges={true}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <BottomNav active="mypage" hasUnread={hasUnread} />

      <style jsx>{`
        .error-strip {
          padding: 4px 12px;
          font-size: 11px;
          color: #b00020;
        }

        .hero-extra {
          margin: 8px 0 12px;
        }

        .apply-btn {
          width: 100%;
          border-radius: 999px;
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 600;
          border: none;
          background: ${applyDone ? "#ddd" : "var(--accent)"};
          color: ${applyDone ? "#666" : "#fff"};
          cursor: ${applyDone ? "default" : "pointer"};
        }

        .store-card {
          margin-bottom: 12px;
        }

        .store-section-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-sub);
          margin-bottom: 6px;
        }

        .store-caption {
          font-size: 11px;
          color: var(--text-sub);
          margin-top: 4px;
          line-height: 1.6;
        }

        .therapist-list {
          list-style: none;
          padding: 0;
          margin: 4px 0 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .therapist-item {
          margin: 0;
        }

        .therapist-link {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          color: inherit;
          text-decoration: none;
        }

        .therapist-avatar {
          width: 40px;
          height: 40px;
        }

        .therapist-item-main {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .therapist-item-name {
          font-size: 13px;
          font-weight: 500;
        }

        .therapist-item-id {
          font-size: 11px;
          color: var(--text-sub);
        }

        /* Therapistページ寄せ */
        .store-posts-section {
          margin-top: 6px;
          padding-bottom: 8px;
        }

        .profile-section-title {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 4px;
          color: var(--text-sub);
        }

        .empty-hint {
          font-size: 12px;
          color: var(--text-sub);
          line-height: 1.6;
        }

        .feed-list {
          display: block;
        }

        :global(.no-link-style) {
          color: inherit;
          text-decoration: none;
        }
      `}</style>
    </div>
  );
}