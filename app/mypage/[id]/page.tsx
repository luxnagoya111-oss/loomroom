// app/mypage/[id]/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

import BottomNav from "@/components/BottomNav";
import AppHeader from "@/components/AppHeader";
import AvatarCircle from "@/components/AvatarCircle";
import PostCard from "@/components/PostCard";

import { makeThreadId } from "@/lib/dmThread";
import { getCurrentUserId, ensureViewerId } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import { timeAgo } from "@/lib/timeAgo";

import {
  getRelation,
  setRelation as setRelationOnServer,
  toRelationFlags,
  type RelationFlags,
} from "@/lib/repositories/relationRepository";

import {
  getRelationFlags as getLocalRelationFlags,
  setRelation as setLocalRelation,
} from "@/lib/relationStorage";

import type { UserId } from "@/types/user";
import { RelationActions } from "@/components/RelationActions";
import { toPublicHandleFromUserId } from "@/lib/handle";

import { hydratePosts, type UiPost } from "@/lib/postFeedHydrator";
import {
  fetchPostsByAuthorIds,
  toggleLike,
  reportPost,
  type DbPostRow as RepoDbPostRow,
} from "@/lib/repositories/postRepository";

import { getConnectionCounts } from "@/lib/repositories/connectionRepository";

const hasUnread = true;

// 旧localStorageデータ（ゲスト互換用）
const STORAGE_PREFIX = "loomroom_profile_v1_";

// 自由入力
type Area = string;
type AccountType = "ゲスト" | "会員";

type UserProfile = {
  displayName: string;
  handle: string;
  area: Area;
  intro: string;
  messagePolicy: string;
  accountType: AccountType;

  // 現状DB未保存（ゲスト互換用としてのみ利用）
  snsX?: string;
  snsLine?: string;
  snsOther?: string;

  avatarUrl?: string | null; // 表示用（http or public URL）
  role?: "user" | "therapist" | "store";
};

const DEFAULT_PROFILE: UserProfile = {
  displayName: "あなた",
  handle: "@user",
  area: "",
  intro: "まだ自己紹介は書かれていません。",
  messagePolicy:
    "通知にすぐ気づけないこともあるので、ゆっくりペースでやりとりできたら嬉しいです。",
  accountType: "ゲスト",
  snsX: "",
  snsLine: "",
  snsOther: "",
  avatarUrl: null,
  role: "user",
};

// users（正）
type DbUserRow = {
  id: string;
  name: string | null;
  role: "user" | "therapist" | "store" | null;
  avatar_url: string | null;

  area: string | null;
  description: string | null;

  // ★ consoleで保存する前提のSNS
  sns_x?: string | null;
  sns_other?: string | null;
};

// therapists（補完用）
type DbTherapistRow = {
  id: string;
  display_name: string | null;
  area: string | null;
  profile: string | null;
};

// stores（補完用）
type DbStoreRow = {
  id: string;
  name: string | null;
  area: string | null;
  description: string | null;
};

// ===== uuid 判定（relations は users.id = uuid で運用）=====
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

// ===== Avatar URL 正規化 =====
const AVATAR_BUCKET = "avatars";

function normalizeAvatarUrl(v: any): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

function isProbablyHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function looksValidAvatarUrl(v: string | null | undefined): boolean {
  const s = (v ?? "").trim();
  if (!s) return false;
  if (s.includes("/storage/v1/object/public/avatars")) {
    if (/\/public\/avatars\/?$/i.test(s)) return false;
  }
  return true;
}

function resolveAvatarUrl(raw: string | null | undefined): string | null {
  const v = normalizeAvatarUrl(raw);
  if (!v) return null;
  if (isProbablyHttpUrl(v)) return v;

  const path = v.startsWith(`${AVATAR_BUCKET}/`)
    ? v.slice(AVATAR_BUCKET.length + 1)
    : v;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

function normalizeFreeText(v: any): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s;
}

// 表示用：users.role を正としてラベル化
function roleLabel(role?: "user" | "therapist" | "store") {
  if (role === "store") return "店舗";
  if (role === "therapist") return "セラピスト";
  return "ユーザー";
}

// ★ handle統一（uuidは @xxxxxx、ゲストは @{id}）
function toDisplayHandleFromPageId(pageId: string): string {
  if (isUuid(pageId)) return toPublicHandleFromUserId(pageId) ?? "@user";
  return `@${pageId}`;
}

const PublicMyPage: React.FC = () => {
  const router = useRouter();

  const params = useParams<{ id: string }>();
  const userId = (params?.id as string) || "user";

  // viewer（ゲスト含む）
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Supabase Auth（uuid会員）
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  const storageKey = `${STORAGE_PREFIX}${userId}`;

  const [profile, setProfile] = useState<UserProfile>(() => ({
    ...DEFAULT_PROFILE,
    handle: toDisplayHandleFromPageId(userId),
  }));
  const [loading, setLoading] = useState<boolean>(true);

  // role別の実体ID（stores.id / therapists.id）を保持（編集導線用）
  const [storeId, setStoreId] = useState<string | null>(null);
  const [therapistId, setTherapistId] = useState<string | null>(null);

  // ===== 投稿（Hydrated UI）=====
  const [viewerUuid, setViewerUuid] = useState<UserId | null>(null);
  const [viewerReady, setViewerReady] = useState<boolean>(false);

  const [posts, setPosts] = useState<UiPost[]>([]);
  const [postError, setPostError] = useState<string | null>(null);
  const [loadingPosts, setLoadingPosts] = useState<boolean>(false);

  // 3点メニュー
  const [menuPostId, setMenuPostId] = useState<string | null>(null);

  // relations 状態
  const [relations, setRelations] = useState<RelationFlags>(getDefaultRelationFlags());

  function getDefaultRelationFlags(): RelationFlags {
    return { following: false, muted: false, blocked: false };
  }

  // ===== following/follower counts（target = users.id(uuid)）=====
  const [followingCount, setFollowingCount] = useState<number | null>(null);
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [loadingCounts, setLoadingCounts] = useState<boolean>(false);

  // viewer id 初期化（guest + auth）
  useEffect(() => {
    if (typeof window === "undefined") return;

    setCurrentUserId(getCurrentUserId());

    supabase.auth
      .getUser()
      .then(({ data }) => setAuthUserId(data.user?.id ?? null))
      .catch(() => setAuthUserId(null));
  }, []);

  // DB操作用 viewer uuid（いいね・通報・liked判定用）
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setViewerReady(false);
        const v = await ensureViewerId();
        if (cancelled) return;
        setViewerUuid(v);
        setViewerReady(true);
      } catch {
        if (cancelled) return;
        setViewerUuid(null);
        setViewerReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Owner 判定（公開ページの対象が users.id(uuid) の場合）
  const isOwner = !!authUserId && isUuid(userId) && authUserId === userId;

  // DMスレッドは「viewer(会員uuid優先) × target(uuid)」
  const viewerIdForThread = authUserId ?? currentUserId;
  const threadId =
    viewerIdForThread && userId && !isOwner
      ? makeThreadId(viewerIdForThread, userId)
      : null;

  /**
   * プロフィール取得方針（要件通り）
   * - 公開 /mypage/[id] は users を正として表示
   * - therapist/store の補助テーブルは「不足時のみ補完」
   * - localStorage はゲストIDの互換用途に限定（uuid会員ページでは使用しない）
   */
  useEffect(() => {
    let cancelled = false;

    const fetchProfile = async () => {
      try {
        setLoading(true);

        // role 切替時に古いIDが残らないようリセット
        setTherapistId(null);
        setStoreId(null);

        // --- 1) ゲストID（uuid以外）は互換として localStorage から読む ---
        if (!isUuid(userId)) {
          // デフォルト
          let p: UserProfile = {
            ...DEFAULT_PROFILE,
            handle: toDisplayHandleFromPageId(userId),
            accountType: "ゲスト",
            role: "user",
          };

          if (typeof window !== "undefined") {
            try {
              const raw = window.localStorage.getItem(storageKey);
              if (raw) {
                const data = JSON.parse(raw) || {};
                p = {
                  ...p,
                  displayName: data.nickname || p.displayName,
                  area: typeof data.area === "string" ? data.area : p.area,
                  intro:
                    typeof data.intro === "string" && data.intro.trim().length > 0
                      ? data.intro
                      : p.intro,
                  messagePolicy:
                    typeof data.messagePolicy === "string" &&
                    data.messagePolicy.trim().length > 0
                      ? data.messagePolicy
                      : p.messagePolicy,
                  snsX: data.snsX ?? p.snsX,
                  snsLine: data.snsLine ?? p.snsLine,
                  snsOther: data.snsOther ?? p.snsOther,
                  avatarUrl: data.avatarDataUrl || data.avatarUrl || p.avatarUrl,
                  accountType: "ゲスト",
                  role: "user",
                };
              }
            } catch (e) {
              console.warn("[PublicMyPage] localStorage profile load failed:", e);
            }
          }

          if (!cancelled) setProfile(p);
          return;
        }

        // --- 2) uuid会員ページ：users を正として取得 ---
        const { data: user, error: userError } = await supabase
          .from("users")
          .select("id, name, role, avatar_url, area, description, sns_x, sns_other")
          .eq("id", userId)
          .maybeSingle<DbUserRow>();

        if (cancelled) return;

        if (userError) {
          console.error("[PublicMyPage] users fetch error:", userError);
          return;
        }
        if (!user) return;

        const userAvatarResolved = looksValidAvatarUrl(user.avatar_url)
          ? resolveAvatarUrl(user.avatar_url)
          : null;

        const uRole = (user.role as UserProfile["role"]) ?? "user";

        // users正：ここで完成形を作る（不足は後で補完）
        let baseProfile: UserProfile = {
          ...DEFAULT_PROFILE,
          handle: toDisplayHandleFromPageId(userId),
          displayName:
            (user.name && user.name.trim().length > 0
              ? user.name
              : uRole === "store"
              ? "店舗アカウント"
              : uRole === "therapist"
              ? "セラピスト"
              : "ユーザー") ?? "ユーザー",
          accountType: "会員",
          role: uRole,
          avatarUrl: userAvatarResolved,
          area: normalizeFreeText(user.area),
          intro:
            user.description && user.description.trim().length > 0
              ? user.description
              : DEFAULT_PROFILE.intro,

          // ★ ここが無いと表示されない
          snsX: normalizeFreeText((user as any).sns_x),
          snsOther: normalizeFreeText((user as any).sns_other),
          // snsLine は現状 users に無い前提なら触らない（将来追加でOK）
        };

        // --- 3) 補助：therapists / stores は不足時のみ補完 ---
        // 補完対象：displayName / area / intro（= description 相当）
        const needsName = !normalizeFreeText(baseProfile.displayName);
        const needsArea = !normalizeFreeText(baseProfile.area);
        const introIsDefault = baseProfile.intro === DEFAULT_PROFILE.intro;

        if (uRole === "therapist" && (needsName || needsArea || introIsDefault)) {
          const { data: t, error: tError } = await supabase
            .from("therapists")
            .select("id, display_name, area, profile")
            .eq("user_id", userId)
            .maybeSingle<DbTherapistRow>();

          if (!cancelled && !tError && t) {
            setTherapistId(t.id);

            baseProfile = {
              ...baseProfile,
              displayName:
                needsName && t.display_name && t.display_name.trim().length > 0
                  ? t.display_name
                  : baseProfile.displayName,
              area:
                needsArea && t.area && t.area.trim().length > 0
                  ? t.area
                  : baseProfile.area,
              intro:
                introIsDefault && t.profile && t.profile.trim().length > 0
                  ? t.profile
                  : baseProfile.intro,
            };
          }
        } else if (uRole === "store" && (needsName || needsArea || introIsDefault)) {
          const { data: s, error: sError } = await supabase
            .from("stores")
            .select("id, name, area, description")
            .eq("owner_user_id", userId)
            .maybeSingle<DbStoreRow>();

          if (!cancelled && !sError && s) {
            setStoreId(s.id);

            baseProfile = {
              ...baseProfile,
              displayName:
                needsName && s.name && s.name.trim().length > 0
                  ? s.name
                  : baseProfile.displayName,
              area:
                needsArea && s.area && s.area.trim().length > 0
                  ? s.area
                  : baseProfile.area,
              intro:
                introIsDefault && s.description && s.description.trim().length > 0
                  ? s.description
                  : baseProfile.intro,
            };
          }
        }

        if (cancelled) return;
        setProfile(baseProfile);
      } catch (e) {
        console.error("[PublicMyPage] unexpected error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [userId, storageKey]);

  // ===== following/follower counts（公開SELECT前提、ログイン不要で表示）=====
  useEffect(() => {
    let cancelled = false;

    async function fetchCounts() {
      if (!isUuid(userId)) {
        setFollowingCount(null);
        setFollowerCount(null);
        return;
      }

      setLoadingCounts(true);
      try {
        const res = await getConnectionCounts(userId);
        if (cancelled) return;

        // connectionRepository の返り値:
        // followers = target_id = userId
        // follows    = user_id  = userId（= following）
        setFollowerCount(res.followers ?? 0);
        setFollowingCount(res.follows ?? 0);
      } catch (e: any) {
        if (cancelled) return;
        console.warn("[PublicMyPage] counts fetch failed:", e);
        setFollowingCount(null);
        setFollowerCount(null);
      } finally {
        if (!cancelled) setLoadingCounts(false);
      }
    }

    void fetchCounts();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // relations 復元（uuid同士はサーバー / それ以外はlocalStorage）
  useEffect(() => {
    const viewerId = authUserId ?? currentUserId;
    if (!viewerId) return;

    // 自分ページは relation 無効
    if (isOwner || viewerId === userId) {
      setRelations(getDefaultRelationFlags());
      return;
    }

    // Supabase relations（uuid同士）
    if (isUuid(authUserId) && isUuid(userId)) {
      let cancelled = false;

      (async () => {
        const row = await getRelation(authUserId as UserId, userId as UserId);
        if (cancelled) return;
        setRelations(toRelationFlags(row));
      })();

      return () => {
        cancelled = true;
      };
    }

    // guest 等：localStorage 版
    const localTargetId = userId as UserId;
    const flags = getLocalRelationFlags(viewerId as UserId, localTargetId);
    setRelations(flags);
  }, [currentUserId, authUserId, userId, isOwner]);

  // relations 操作用ハンドラ（uuid同士はサーバー / それ以外はlocalStorage）
  const handleToggleFollow = async () => {
    const viewerId = authUserId ?? currentUserId;
    if (!viewerId) return;
    if (isOwner || viewerId === userId) return;

    const nextEnabled = !relations.following;

    if (isUuid(authUserId) && isUuid(userId)) {
      const ok = await setRelationOnServer({
        userId: authUserId as UserId,
        targetId: userId as UserId,
        type: nextEnabled ? "follow" : null,
      });
      if (!ok) return;

      setRelations({ following: nextEnabled, muted: false, blocked: false });

      // 表示対象（userId）の followerCount を楽観更新（viewerがfollow/unfollowした分）
      setFollowerCount((prev) => {
        if (typeof prev !== "number") return prev;
        const next = prev + (nextEnabled ? 1 : -1);
        return Math.max(0, next);
      });

      return;
    }

    const updated = setLocalRelation(
      viewerId as UserId,
      userId as UserId,
      "follow",
      nextEnabled
    );
    setRelations(updated);

    // ゲスト互換でも見た目だけは合わせる（uuid以外はそもそもcounts非表示）
    setFollowerCount((prev) => {
      if (!isUuid(userId)) return prev;
      if (typeof prev !== "number") return prev;
      const next = prev + (nextEnabled ? 1 : -1);
      return Math.max(0, next);
    });
  };

  const handleToggleMute = async () => {
    const viewerId = authUserId ?? currentUserId;
    if (!viewerId) return;
    if (isOwner || viewerId === userId) return;

    const nextEnabled = !relations.muted;

    if (isUuid(authUserId) && isUuid(userId)) {
      const ok = await setRelationOnServer({
        userId: authUserId as UserId,
        targetId: userId as UserId,
        type: nextEnabled ? "mute" : null,
      });
      if (!ok) return;

      setRelations({ following: false, muted: nextEnabled, blocked: false });
      return;
    }

    const updated = setLocalRelation(
      viewerId as UserId,
      userId as UserId,
      "mute",
      nextEnabled
    );
    setRelations(updated);
  };

  const handleToggleBlock = async () => {
    const viewerId = authUserId ?? currentUserId;
    if (!viewerId) return;
    if (isOwner || viewerId === userId) return;

    const nextEnabled = !relations.blocked;

    if (nextEnabled) {
      const ok = window.confirm(
        "このアカウントをブロックしますか？\nタイムラインやDMからも非表示になります。"
      );
      if (!ok) return;
    }

    if (isUuid(authUserId) && isUuid(userId)) {
      const ok = await setRelationOnServer({
        userId: authUserId as UserId,
        targetId: userId as UserId,
        type: nextEnabled ? "block" : null,
      });
      if (!ok) return;

      setRelations({ following: false, muted: false, blocked: nextEnabled });
      return;
    }

    const updated = setLocalRelation(
      viewerId as UserId,
      userId as UserId,
      "block",
      nextEnabled
    );
    setRelations(updated);
  };

  // ===== 投稿一覧（author揺れ対応 → hydrate → PostCard）=====
  const authorIdsForPosts = useMemo(() => {
    // TL/投稿は「author_id に入ってる可能性があるID全部」を拾う
    const set = new Set<string>();
    if (userId) set.add(userId);
    if (therapistId) set.add(therapistId);
    if (storeId) set.add(storeId);
    return Array.from(set);
  }, [userId, therapistId, storeId]);

  useEffect(() => {
    let cancelled = false;

    const fetchPosts = async () => {
      try {
        setLoadingPosts(true);
        setPostError(null);
        setMenuPostId(null);

        if (!authorIdsForPosts.length) {
          setPosts([]);
          return;
        }

        // 親投稿のみ（TLと統一）
        const rows = await fetchPostsByAuthorIds({
          authorIds: authorIdsForPosts,
          excludeReplies: true,
          limit: 50,
        });

        if (cancelled) return;

        const hydrated = await hydratePosts({
          rows: rows as unknown as RepoDbPostRow[],
          viewerUuid: viewerUuid,
        });

        if (cancelled) return;

        setPosts(hydrated);
      } catch (e: any) {
        if (cancelled) return;
        console.error("[PublicMyPage] posts unexpected error:", e);
        setPostError(
          e?.message ??
            "投稿の取得中に不明なエラーが発生しました。時間をおいて再度お試しください。"
        );
        setPosts([]);
      } finally {
        if (!cancelled) setLoadingPosts(false);
      }
    };

    if (userId) void fetchPosts();

    return () => {
      cancelled = true;
    };
  }, [userId, authorIdsForPosts, viewerUuid]);

  // ===== PostCard handlers =====
  const handleOpenDetail = (postId: string) => {
    router.push(`/posts/${postId}`);
  };

  const handleOpenProfile = (profilePath: string | null) => {
    if (!profilePath) return;
    router.push(profilePath);
  };

  const handleToggleLike = async (post: UiPost) => {
    if (!viewerReady) return;
    if (!viewerUuid || !isUuid(viewerUuid)) return;

    const nextLiked = !post.liked;

    // optimistic
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? {
              ...p,
              liked: nextLiked,
              likeCount: Math.max(0, (p.likeCount ?? 0) + (nextLiked ? 1 : -1)),
            }
          : p
      )
    );

    const res = await toggleLike({
      postId: post.id,
      userId: viewerUuid,
      nextLiked,
      currentLikeCount: post.likeCount ?? 0,
    });

    if (!res.ok) {
      // rollback
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, liked: post.liked, likeCount: post.likeCount ?? 0 }
            : p
        )
      );
      return;
    }

    // server truth (count)
    setPosts((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, likeCount: res.likeCount } : p))
    );
  };

  const handleReply = (postId: string) => {
    // 返信UIは投稿詳細に集約（次フェーズで /posts/[id] 内に composer）
    router.push(`/posts/${postId}?reply=1`);
  };

  const handleOpenMenu = (postId: string) => {
    setMenuPostId((prev) => (prev === postId ? null : postId));
  };

  const handleReport = async (postId: string) => {
    if (!viewerReady) return;
    if (!viewerUuid || !isUuid(viewerUuid)) return;

    const ok = window.confirm("この投稿を通報しますか？");
    if (!ok) return;

    const success = await reportPost({ postId, reporterId: viewerUuid, reason: null });
    if (success) {
      alert("通報を受け付けました。ご協力ありがとうございます。");
      setMenuPostId(null);
    } else {
      alert("通報に失敗しました。時間をおいて再度お試しください。");
    }
  };

  const avatarInitial =
    profile.displayName?.trim()?.charAt(0)?.toUpperCase() || "U";

  // DMリンクは「相手がuuid」かつ「自分がAuth uuid」かつ「非ブロック」のときだけ出す
  const canShowDm =
    !isOwner && !relations.blocked && isUuid(authUserId) && isUuid(userId);

  const canShowRelationUi = !!(authUserId ?? currentUserId) && !isOwner;

  const isMeByGuest = !!currentUserId && currentUserId === userId;
  const canEdit = isOwner || isMeByGuest;

  // counts 表示は「対象がuuidなら表示」（ログイン不要）
  const canShowCounts = isUuid(userId);

  const followingHref = `/connections/${userId}?tab=following`;
  const followerHref = `/connections/${userId}?tab=followers`;

  const blockedView = !isOwner && relations.blocked;

  return (
    <>
      <div className="app-shell">
        <AppHeader title={profile.displayName} subtitle={profile.handle} showBack={true} />

        <main className="app-main">
          <section className="therapist-hero">
            <div className="therapist-hero-row">
              <AvatarCircle
                className="avatar-circle"
                size={48}
                avatarUrl={profile.avatarUrl ?? null}
                displayName={profile.displayName}
                fallbackText={avatarInitial}
                alt=""
              />

              <div className="therapist-hero-main">
                <div className="therapist-name-row">
                  <span className="therapist-name">{profile.displayName}</span>

                  <span className="therapist-handle">
                    {profile.handle}

                    {canShowDm && threadId && (
                      <Link
                        href={`/messages/new?to=${userId}`}
                        className="dm-inline-btn no-link-style"
                      >
                        ✉
                      </Link>
                    )}

                    {canEdit && (
                      <>
                        {profile.role === "store" && storeId ? (
                          <Link
                            href={`/store/${storeId}/console`}
                            className="edit-inline-btn no-link-style"
                          >
                            ✎
                          </Link>
                        ) : profile.role === "therapist" && therapistId ? (
                          <Link
                            href={`/therapist/${therapistId}/console`}
                            className="edit-inline-btn no-link-style"
                          >
                            ✎
                          </Link>
                        ) : (
                          <Link
                            href={`/mypage/${userId}/console`}
                            className="edit-inline-btn no-link-style"
                          >
                            ✎
                          </Link>
                        )}
                      </>
                    )}
                  </span>
                </div>

                <div className="therapist-meta-row">
                  <span>アカウント種別：{roleLabel(profile.role)}</span>
                  <span>エリア：{profile.area || "未設定"}</span>
                </div>

                <div className="therapist-stats-row">
                  <span>
                    投稿 <strong>{posts.length}</strong>
                  </span>

                  <span>
                    フォロー中{" "}
                    <strong>
                      {canShowCounts ? (
                        <Link href={followingHref} className="stats-link">
                          {loadingCounts ? "…" : followingCount ?? "–"}
                        </Link>
                      ) : (
                        "–"
                      )}
                    </strong>
                  </span>

                  <span>
                    フォロワー{" "}
                    <strong>
                      {canShowCounts ? (
                        <Link href={followerHref} className="stats-link">
                          {loadingCounts ? "…" : followerCount ?? "–"}
                        </Link>
                      ) : (
                        "–"
                      )}
                    </strong>
                  </span>
                </div>

                {canShowRelationUi && !canEdit && (
                  <RelationActions
                    flags={relations}
                    onToggleFollow={handleToggleFollow}
                    onToggleMute={handleToggleMute}
                    onToggleBlock={handleToggleBlock}
                    onReport={() => {
                      alert("このアカウントの通報を受け付けました（現在はテスト用です）。");
                    }}
                  />
                )}
              </div>
            </div>

            {loading && (
              <p className="therapist-intro" style={{ opacity: 0.7 }}>
                プロフィールを読み込んでいます…
              </p>
            )}

            {!loading && profile.intro && (
              <p className="therapist-intro">{profile.intro}</p>
            )}

            {(profile.snsX || profile.snsLine || profile.snsOther) && (
              <div className="therapist-sns-block">
                <div className="therapist-sns-title">関連リンク</div>
                <div className="therapist-sns-list">
                  {profile.snsX && (
                    <a
                      href={profile.snsX}
                      target="_blank"
                      className="therapist-sns-chip"
                      rel="noreferrer"
                    >
                      X（旧Twitter）
                    </a>
                  )}
                  {profile.snsLine && (
                    <a
                      href={profile.snsLine}
                      target="_blank"
                      className="therapist-sns-chip"
                      rel="noreferrer"
                    >
                      LINE
                    </a>
                  )}
                  {profile.snsOther && (
                    <a
                      href={profile.snsOther}
                      target="_blank"
                      className="therapist-sns-chip"
                      rel="noreferrer"
                    >
                      その他のリンク
                    </a>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="therapist-posts-section">
            <h2 className="therapist-section-title">投稿</h2>

            {blockedView && (
              <div className="empty-hint" style={{ color: "#b00020" }}>
                このアカウントはブロック中のため、投稿は表示されません。
              </div>
            )}

            {!blockedView && loadingPosts && (
              <div className="empty-hint">投稿を読み込んでいます…</div>
            )}

            {!blockedView && postError && !loadingPosts && (
              <div className="empty-hint" style={{ color: "#b00020" }}>
                {postError}
              </div>
            )}

            {!blockedView && !loadingPosts && !postError && posts.length === 0 && (
              <div className="empty-hint">まだ投稿はありません。</div>
            )}

            {!blockedView && !loadingPosts && !postError && posts.length > 0 && (
              <div className="feed-list">
                {posts.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    viewerReady={viewerReady}
                    viewerUuid={viewerReady && viewerUuid ? viewerUuid : null}
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
      </div>

      <style jsx>{`
        .therapist-hero {
          padding: 4px 0 12px;
          margin-bottom: 8px;
        }

        .therapist-hero-row {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-bottom: 8px;
        }

        .therapist-hero-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .therapist-name-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: baseline;
        }

        .therapist-name {
          font-size: 16px;
          font-weight: 600;
        }

        .therapist-handle {
          font-size: 12px;
          color: var(--text-sub);
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .therapist-meta-row {
          font-size: 11px;
          color: var(--text-sub);
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .therapist-stats-row {
          font-size: 11px;
          color: var(--text-sub);
          display: flex;
          gap: 10px;
        }

        .therapist-intro {
          font-size: 13px;
          line-height: 1.7;
          margin-top: 6px;
        }

        .therapist-sns-block {
          margin-top: 10px;
        }

        .therapist-sns-title {
          font-size: 12px;
          color: var(--text-sub);
          margin-bottom: 4px;
        }

        .therapist-sns-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .therapist-sns-chip {
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-main);
          text-decoration: none;
        }

        .therapist-posts-section {
          margin-top: 6px;
        }

        .therapist-section-title {
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

        .avatar-small {
          width: 32px;
          height: 32px;
        }

        .edit-inline-btn {
          margin-left: 6px;
          font-size: 14px;
          opacity: 0.8;
        }
        .edit-inline-btn:hover {
          opacity: 1;
        }

        :global(.no-link-style) {
          color: inherit;
          text-decoration: none;
        }

        .stats-link {
          color: inherit;
          text-decoration: none;
        }
        .stats-link:hover {
          opacity: 0.9;
        }
      `}</style>
    </>
  );
};

export default PublicMyPage;