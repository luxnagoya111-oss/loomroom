// app/therapist/[id]/page.tsx
"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

import AvatarCircle from "@/components/AvatarCircle";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";

import { supabase } from "@/lib/supabaseClient";
import { getCurrentUserId, ensureViewerId } from "@/lib/auth";
import { timeAgo } from "@/lib/timeAgo";
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
  toggleLike,
  reportPost,
  type DbPostRow as RepoPostRow,
} from "@/lib/repositories/postRepository";

import { resolveAvatarUrl, pickRawPostImages, resolvePostImageUrls } from "@/lib/postMedia";

import type { UserId } from "@/types/user";
import type { DbTherapistRow, DbUserRow, DbStoreRow } from "@/types/db";
import { RelationActions } from "@/components/RelationActions";

// ===== uuid 判定（relations は users.id = uuid で運用する）=====
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

// relations.type 互換（過去の "following" を吸収）
const FOLLOW_TYPES = ["follow", "following"] as const;

type TherapistProfile = {
  displayName: string;
  handle: string;
  area: string;
  intro: string;
  avatarUrl?: string | null;

  snsX?: string;
  snsLine?: string;
  snsOther?: string;
};

type LinkedStoreInfo = {
  id: string;
  name: string;
  area?: string | null;
  avatarUrl?: string | null;
  websiteUrl?: string | null;
  lineUrl?: string | null;
};

type UiPost = {
  id: string;
  body: string;
  timeAgo: string;
  imageUrls: string[];
  likeCount: number;
  replyCount: number;
};

function safeNumber(v: any, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const TherapistProfilePage: React.FC = () => {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const therapistId = (params?.id as string) || ""; // therapists.id

  // viewer（ゲスト含む）
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // Supabase Auth（uuid会員）
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  // DB操作に使う viewer uuid（未ログインなら null）
  const [viewerUuid, setViewerUuid] = useState<UserId | null>(null);

  // therapists.user_id（= users.id / uuid）
  const [therapistUserId, setTherapistUserId] = useState<string | null>(null);

  // 所属店舗ID（store_id）
  const [linkedStoreId, setLinkedStoreId] = useState<string | null>(null);
  const isStoreLinked = !!linkedStoreId;

  // 在籍店舗表示用
  const [linkedStore, setLinkedStore] = useState<LinkedStoreInfo | null>(null);
  const [loadingStore, setLoadingStore] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);

  // 「自分のページ」判定は Supabase Auth uuid を正とする
  const isOwner =
    !!authUserId &&
    !!therapistUserId &&
    isUuid(authUserId) &&
    isUuid(therapistUserId) &&
    authUserId === therapistUserId;

  // relations 状態
  const [relations, setRelations] = useState<RelationFlags>({
    following: false,
    muted: false,
    blocked: false,
  });

  const [profile, setProfile] = useState<TherapistProfile>({
    displayName: "",
    handle: "",
    area: "",
    intro: "",
    avatarUrl: null,
    snsX: "",
    snsLine: "",
    snsOther: "",
  });

  const [loadingProfile, setLoadingProfile] = useState<boolean>(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [posts, setPosts] = useState<UiPost[]>([]);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [loadingPosts, setLoadingPosts] = useState<boolean>(false);

  // liked（viewerUuidがある時だけ）
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  // ===== counts（mypage と同一思想：集計対象は users.id(uuid)）=====
  const [followingCount, setFollowingCount] = useState<number | null>(null);
  const [followersCount, setFollowersCount] = useState<number | null>(null);
  const [loadingCounts, setLoadingCounts] = useState<boolean>(false);

  // currentUserId / authUserId / viewerUuid 初期化
  useEffect(() => {
    if (typeof window === "undefined") return;

    setCurrentUserId(getCurrentUserId());

    supabase.auth
      .getUser()
      .then(({ data }) => setAuthUserId(data.user?.id ?? null))
      .catch(() => setAuthUserId(null));

    // DB用の viewer uuid（未ログインなら null）
    ensureViewerId()
      .then((uid) => setViewerUuid(uid))
      .catch(() => setViewerUuid(null));
  }, []);

  // relation 復元（uuid会員同士のみ / 自分のページは無効）
  useEffect(() => {
    if (isOwner) {
      setRelations({ following: false, muted: false, blocked: false });
      return;
    }

    if (!isUuid(authUserId) || !isUuid(therapistUserId)) {
      setRelations({ following: false, muted: false, blocked: false });
      return;
    }

    if (authUserId === therapistUserId) return;

    let cancelled = false;
    (async () => {
      const row = await getRelation(authUserId as UserId, therapistUserId as UserId);
      if (cancelled) return;
      setRelations(toRelationFlags(row));
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId, therapistUserId, isOwner]);

  // ===== フォロー / ミュート / ブロック（uuid会員同士のみ）=====
  const handleToggleFollow = async () => {
    if (isOwner) return;
    if (!isUuid(authUserId) || !isUuid(therapistUserId)) return;

    const nextEnabled = !relations.following;

    const ok = await setRelationOnServer({
      userId: authUserId as UserId,
      targetId: therapistUserId as UserId,
      type: nextEnabled ? "follow" : null,
    });
    if (!ok) return;

    setRelations({ following: nextEnabled, muted: false, blocked: false });

    // counts の体感：フォロワー数を楽観更新（後続再集計で整合）
    setFollowersCount((prev) => {
      if (typeof prev !== "number") return prev;
      const next = nextEnabled ? prev + 1 : prev - 1;
      return next < 0 ? 0 : next;
    });
  };

  const handleToggleMute = async () => {
    if (isOwner) return;
    if (!isUuid(authUserId) || !isUuid(therapistUserId)) return;

    const nextEnabled = !relations.muted;

    const ok = await setRelationOnServer({
      userId: authUserId as UserId,
      targetId: therapistUserId as UserId,
      type: nextEnabled ? "mute" : null,
    });
    if (!ok) return;

    setRelations({ following: false, muted: nextEnabled, blocked: false });
  };

  const handleToggleBlock = async () => {
    if (isOwner) return;
    if (!isUuid(authUserId) || !isUuid(therapistUserId)) return;

    const nextEnabled = !relations.blocked;

    if (nextEnabled) {
      const ok = window.confirm(
        "このセラピストをブロックしますか？\nタイムラインやDMからも非表示になります。"
      );
      if (!ok) return;
    }

    const ok = await setRelationOnServer({
      userId: authUserId as UserId,
      targetId: therapistUserId as UserId,
      type: nextEnabled ? "block" : null,
    });
    if (!ok) return;

    setRelations({ following: false, muted: false, blocked: nextEnabled });
  };

  // ===== therapists / users / posts を取得（author_id 揺れに備えて authorIds を作る）=====
  useEffect(() => {
    let cancelled = false;

    const fetchProfileAndPosts = async () => {
      if (!therapistId) {
        setProfileError("セラピストIDが取得できませんでした。URLをご確認ください。");
        setLoadingProfile(false);
        return;
      }

      try {
        setLoadingProfile(true);
        setProfileError(null);
        setLoadingPosts(true);
        setPostsError(null);

        // 1) therapists
        const { data: therapist, error: tError } = await supabase
          .from("therapists")
          .select("id, user_id, store_id, display_name, area, profile, avatar_url, sns_x, sns_line, sns_other")
          .eq("id", therapistId)
          .maybeSingle<DbTherapistRow>();

        if (cancelled) return;

        if (tError) {
          console.error("[TherapistProfile] therapist fetch error:", tError);
          setProfileError((tError as any)?.message ?? "セラピスト情報の取得に失敗しました。");
          return;
        }

        if (!therapist) {
          setProfileError("セラピスト情報が見つかりませんでした。");
          return;
        }

        const tuid = (therapist as any).user_id ?? null;
        setTherapistUserId(tuid);
        setLinkedStoreId((therapist as any).store_id ?? null);

        // 2) users（avatar優先用 / handle用）
        let user: DbUserRow | null = null;
        if (tuid) {
          const { data: userRow, error: uError } = await supabase
            .from("users")
            .select("id, name, avatar_url")
            .eq("id", tuid)
            .maybeSingle<DbUserRow>();

          if (!cancelled) {
            if (uError) {
              console.error("[TherapistProfile] user fetch error:", uError);
            } else {
              user = userRow;
            }
          }
        }

        if (cancelled) return;

        const displayName =
          (therapist as any).display_name?.trim()?.length
            ? (therapist as any).display_name
            : (user as any)?.name?.trim()?.length
            ? (user as any).name
            : "セラピスト";

        const handle = tuid ? toPublicHandleFromUserId(tuid) ?? "" : "";

        const area =
          typeof (therapist as any).area === "string" ? (therapist as any).area.trim() : "";

        const intro =
          (therapist as any).profile?.trim()?.length ? (therapist as any).profile : "";

        // avatar: users.avatar_url 優先 → therapists.avatar_url
        const rawAvatar = (user as any)?.avatar_url ?? (therapist as any)?.avatar_url ?? null;
        const avatarUrl = resolveAvatarUrl(rawAvatar);

        setProfile({
          displayName,
          handle,
          area,
          intro,
          avatarUrl,
          snsX: (therapist as any)?.sns_x ?? "",
          snsLine: (therapist as any)?.sns_line ?? "",
          snsOther: (therapist as any)?.sns_other ?? "",
        });

        // 3) posts（author_id 揺れ対策：users.id + therapists.id の両方を候補に）
        const authorIds: string[] = [];
        if (tuid) authorIds.push(tuid);
        authorIds.push(therapistId);

        const rows = await fetchPostsByAuthorIds({
          authorIds,
          excludeReplies: true,
          limit: 50,
        });

        if (cancelled) return;

        const mapped: UiPost[] = (rows ?? []).map((row: RepoPostRow) => {
          const rawImages = pickRawPostImages(row as any);
          const imageUrls = resolvePostImageUrls(rawImages);
          return {
            id: row.id,
            body: row.body ?? "",
            timeAgo: timeAgo(row.created_at),
            imageUrls,
            likeCount: safeNumber(row.like_count, 0),
            replyCount: safeNumber(row.reply_count, 0),
          };
        });

        setPosts(mapped);
      } catch (e: any) {
        if (cancelled) return;
        console.error("[TherapistProfile] unexpected error:", e);
        setProfileError(e?.message ?? "不明なエラーが発生しました。");
        setPostsError(
          e?.message ??
            "投稿の取得中に不明なエラーが発生しました。時間をおいて再度お試しください。"
        );
        setPosts([]);
      } finally {
        if (!cancelled) {
          setLoadingPosts(false);
          setLoadingProfile(false);
        }
      }
    };

    void fetchProfileAndPosts();
    return () => {
      cancelled = true;
    };
  }, [therapistId]);

  // ===== viewerUuid が取れたら likedIds を取得 =====
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!viewerUuid || !isUuid(viewerUuid)) {
        setLikedIds(new Set());
        return;
      }
      const set = await fetchLikedPostIdsForUser(viewerUuid);
      if (cancelled) return;
      setLikedIds(set);
    })();

    return () => {
      cancelled = true;
    };
  }, [viewerUuid]);

  // ===== store_id がある場合のみ stores を取得（在籍表示用）=====
  useEffect(() => {
    let cancelled = false;

    const loadStore = async (sid: string) => {
      try {
        setLoadingStore(true);
        setStoreError(null);

        const { data, error } = await supabase
          .from("stores")
          .select("id, name, area, avatar_url, website_url, line_url")
          .eq("id", sid)
          .maybeSingle<DbStoreRow>();

        if (cancelled) return;

        if (error) {
          console.error("[TherapistProfile] store fetch error:", error);
          setStoreError((error as any)?.message ?? "店舗情報の取得に失敗しました。");
          setLinkedStore(null);
          return;
        }

        if (!data) {
          setLinkedStore(null);
          return;
        }

        setLinkedStore({
          id: data.id,
          name: (data as any).name ?? "店舗",
          area: (data as any).area ?? null,
          avatarUrl: resolveAvatarUrl((data as any).avatar_url ?? null),
          websiteUrl: (data as any).website_url ?? null,
          lineUrl: (data as any).line_url ?? null,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error("[TherapistProfile] store unexpected error:", e);
        setStoreError(e?.message ?? "店舗情報の取得に失敗しました。");
        setLinkedStore(null);
      } finally {
        if (!cancelled) setLoadingStore(false);
      }
    };

    if (linkedStoreId) void loadStore(linkedStoreId);
    else {
      setLinkedStore(null);
      setStoreError(null);
      setLoadingStore(false);
    }

    return () => {
      cancelled = true;
    };
  }, [linkedStoreId]);

  /**
   * ===== フォロー中 / フォロワー数（mypageと同一）=====
   * 表示対象は users.id(uuid) = therapistUserId
   */
  useEffect(() => {
    let cancelled = false;

    async function loadCounts(uid: string) {
      if (!isUuid(uid)) {
        setFollowingCount(null);
        setFollowersCount(null);
        return;
      }

      setLoadingCounts(true);
      try {
        const followingReq = supabase
          .from("relations")
          .select("target_id", { count: "exact", head: true })
          .eq("user_id", uid)
          .in("type", FOLLOW_TYPES as any);

        const followersReq = supabase
          .from("relations")
          .select("user_id", { count: "exact", head: true })
          .eq("target_id", uid)
          .in("type", FOLLOW_TYPES as any);

        const [followingRes, followersRes] = await Promise.all([followingReq, followersReq]);

        if (cancelled) return;

        if (followingRes.error) {
          console.error("[TherapistProfile] following count error:", followingRes.error);
        }
        if (followersRes.error) {
          console.error("[TherapistProfile] followers count error:", followersRes.error);
        }

        setFollowingCount(typeof followingRes.count === "number" ? followingRes.count : 0);
        setFollowersCount(typeof followersRes.count === "number" ? followersRes.count : 0);
      } catch (e) {
        if (cancelled) return;
        console.error("[TherapistProfile] count unexpected error:", e);
        setFollowingCount(0);
        setFollowersCount(0);
      } finally {
        if (!cancelled) setLoadingCounts(false);
      }
    }

    if (therapistUserId) void loadCounts(therapistUserId);
    else {
      setFollowingCount(null);
      setFollowersCount(null);
    }

    return () => {
      cancelled = true;
    };
  }, [therapistUserId]);

  // counts 表示可否（対象がuuidなら表示）
  const canShowCounts = isUuid(therapistUserId);

  const followingHref =
    therapistUserId && isUuid(therapistUserId) ? `/connections/${therapistUserId}?tab=following` : "#";
  const followerHref =
    therapistUserId && isUuid(therapistUserId) ? `/connections/${therapistUserId}?tab=followers` : "#";

  // Relation UI は uuid会員同士 + 自分以外 のときだけ
  const canShowRelationUi = !isOwner && isUuid(authUserId) && isUuid(therapistUserId);

  // DMボタンは「店舗に紐づいていて」「会員ログイン済み」「相手uuid」「自分ではなく」「ブロックしていない」場合のみ
  const canShowDmButton =
    isStoreLinked && !relations.blocked && !isOwner && isUuid(authUserId) && isUuid(therapistUserId);

  const showSnsBlock = !!(profile.snsX || profile.snsLine || profile.snsOther);
  const areaLabel = profile.area?.trim() ? profile.area.trim() : "未設定";

  const avatarInitial = useMemo(() => {
    return profile.displayName?.trim()?.charAt(0)?.toUpperCase() || "T";
  }, [profile.displayName]);

  const onClickPost = useCallback(
    (postId: string) => {
      router.push(`/posts/${postId}`);
    },
    [router]
  );

  const handleToggleLike = useCallback(
    async (postId: string) => {
      if (!viewerUuid || !isUuid(viewerUuid)) return;

      const isLiked = likedIds.has(postId);

      // optimistic
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (isLiked) next.delete(postId);
        else next.add(postId);
        return next;
      });
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                likeCount: Math.max(p.likeCount + (isLiked ? -1 : 1), 0),
              }
            : p
        )
      );

      const target = posts.find((p) => p.id === postId);
      const currentLikeCount = target ? target.likeCount + (isLiked ? 1 : -1) : 0; // optimistic前を概算
      const res = await toggleLike({
        postId,
        userId: viewerUuid,
        nextLiked: !isLiked,
        currentLikeCount: Math.max(currentLikeCount, 0),
      });

      if (!res.ok) {
        // rollback
        setLikedIds((prev) => {
          const next = new Set(prev);
          if (isLiked) next.add(postId);
          else next.delete(postId);
          return next;
        });
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  likeCount: Math.max(p.likeCount + (isLiked ? 1 : -1), 0),
                }
              : p
          )
        );
      } else {
        setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, likeCount: res.likeCount } : p)));
      }
    },
    [viewerUuid, likedIds, posts]
  );

  const handleReportPost = useCallback(
    async (postId: string) => {
      if (!viewerUuid || !isUuid(viewerUuid)) {
        alert("通報はログイン後にご利用いただけます。");
        return;
      }
      const ok = window.confirm("この投稿を通報しますか？");
      if (!ok) return;

      const done = await reportPost({ postId, reporterId: viewerUuid, reason: null });
      if (done) alert("通報を受け付けました。ご協力ありがとうございます。");
      else alert("通報に失敗しました。時間をおいて再度お試しください。");
    },
    [viewerUuid]
  );

  return (
    <>
      <div className="app-shell">
        <AppHeader title={profile.displayName || "セラピスト"} subtitle={profile.handle || ""} showBack={true} />

        <main className="app-main">
          <section className="profile-hero">
            <div className="profile-hero-row">
              <AvatarCircle
                avatarUrl={profile.avatarUrl}
                size={48}
                displayName={profile.displayName || profile.handle || "T"}
                fallbackText={avatarInitial}
              />

              <div className="profile-hero-main">
                <div className="profile-name-row">
                  <span className="profile-name">{profile.displayName || "名前未設定"}</span>

                  <span className="profile-handle">
                    {profile.handle || ""}

                    {canShowDmButton && therapistUserId && (
                      <Link href={`/messages/new?to=${therapistUserId}`} className="dm-inline-btn no-link-style">
                        ✉
                      </Link>
                    )}

                    {isOwner && (
                      <Link href={`/therapist/${therapistId}/console`} className="edit-inline-btn no-link-style">
                        ✎
                      </Link>
                    )}
                  </span>
                </div>

                <div className="profile-meta-row">
                  <span className="profile-meta-item">アカウント種別：セラピスト</span>
                  <span className="profile-meta-item">対応エリア：{areaLabel}</span>

                  {!isStoreLinked && <span className="profile-tag">テスト参加中（店舗と紐づけ前）</span>}
                </div>

                <div className="profile-stats-row">
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
                          {loadingCounts ? "…" : followersCount ?? "–"}
                        </Link>
                      ) : (
                        "–"
                      )}
                    </strong>
                  </span>
                </div>

                {canShowRelationUi && (
                  <RelationActions
                    flags={relations}
                    onToggleFollow={handleToggleFollow}
                    onToggleMute={handleToggleMute}
                    onToggleBlock={handleToggleBlock}
                    onReport={() => {
                      alert("このプロフィールの通報を受け付けました。");
                    }}
                  />
                )}
              </div>
            </div>

            {!isStoreLinked && (
              <p className="profile-notice">
                このセラピストは現在テスト参加中です。店舗と紐づくまで、LRoomからのDMはご利用いただけません。
              </p>
            )}

            {loadingProfile && <p className="profile-intro">プロフィールを読み込んでいます…</p>}
            {profileError && (
              <p className="profile-intro" style={{ color: "#b00020" }}>
                {profileError}
              </p>
            )}
            {!loadingProfile && profile.intro && <p className="profile-intro">{profile.intro}</p>}

            {showSnsBlock && (
              <div className="profile-sns-block">
                <div className="profile-sns-title">関連リンク</div>
                <div className="profile-sns-list">
                  {profile.snsX && (
                    <a href={profile.snsX} target="_blank" rel="noreferrer" className="profile-sns-chip">
                      X（旧Twitter）
                    </a>
                  )}
                  {profile.snsLine && (
                    <a href={profile.snsLine} target="_blank" rel="noreferrer" className="profile-sns-chip">
                      LINE
                    </a>
                  )}
                  {profile.snsOther && (
                    <a href={profile.snsOther} target="_blank" rel="noreferrer" className="profile-sns-chip">
                      その他のリンク
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* 在籍店舗 */}
            {isStoreLinked && (
              <div className="linked-store-block">
                <div className="linked-store-title">在籍店舗</div>

                {loadingStore && (
                  <div className="linked-store-card">
                    <div className="linked-store-row">
                      <AvatarCircle size={40} fallbackText="…" className="store-avatar" />
                      <div className="linked-store-main">
                        <div className="linked-store-name">読み込み中…</div>
                        <div className="linked-store-meta">店舗情報を取得しています</div>
                      </div>
                    </div>
                  </div>
                )}

                {!loadingStore && storeError && (
                  <div className="linked-store-card">
                    <div className="linked-store-row">
                      <AvatarCircle size={40} fallbackText="!" className="store-avatar" />
                      <div className="linked-store-main">
                        <div className="linked-store-name">在籍店舗</div>
                        <div className="linked-store-meta" style={{ color: "#b00020" }}>
                          {storeError}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {!loadingStore && !storeError && linkedStore && (
                  <Link href={`/store/${linkedStore.id}`} className="linked-store-card linked-store-link-wrapper">
                    <div className="linked-store-row">
                      <AvatarCircle
                        avatarUrl={linkedStore.avatarUrl}
                        size={40}
                        displayName={linkedStore.name || "S"}
                        className="store-avatar"
                      />
                      <div className="linked-store-main">
                        <div className="linked-store-name">{linkedStore.name}</div>
                        <div className="linked-store-meta">{linkedStore.area || "エリア未設定"}</div>
                      </div>
                    </div>
                  </Link>
                )}

                {!loadingStore && !storeError && !linkedStore && (
                  <div className="linked-store-card">
                    <div className="linked-store-row">
                      <AvatarCircle size={40} fallbackText="S" className="store-avatar" />
                      <div className="linked-store-main">
                        <div className="linked-store-name">在籍店舗</div>
                        <div className="linked-store-meta">在籍店舗が見つかりませんでした</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 投稿一覧 */}
          <section className="therapist-posts-section">
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
                {posts.map((p) => {
                  const liked = likedIds.has(p.id);
                  return (
                    <article
                      key={p.id}
                      className="feed-item"
                      role="button"
                      tabIndex={0}
                      aria-label="投稿の詳細を見る"
                      onClick={() => onClickPost(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onClickPost(p.id);
                        }
                      }}
                    >
                      <div className="feed-item-inner">
                        <AvatarCircle
                          avatarUrl={profile.avatarUrl ?? null}
                          size={40}
                          displayName={profile.displayName || profile.handle || "T"}
                          fallbackText={avatarInitial}
                          alt=""
                        />

                        <div className="feed-main">
                          <div className="feed-header">
                            <div className="feed-name-row">
                              <span className="post-name">{profile.displayName || "名前未設定"}</span>
                              <span className="post-username">{profile.handle || ""}</span>
                            </div>

                            <div className="post-meta">
                              <span className="post-time">{p.timeAgo}</span>
                            </div>
                          </div>

                          {!!p.imageUrls.length && (
                            <div className="post-images" onClick={(e) => e.stopPropagation()}>
                              {p.imageUrls.map((url, idx) => (
                                <img key={`${p.id}-${idx}`} src={url} alt="" className="post-image" loading="lazy" />
                              ))}
                            </div>
                          )}

                          <div className="post-body">
                            {p.body.split("\n").map((line, idx) => (
                              <p key={idx}>{line || <span style={{ opacity: 0.3 }}>　</span>}</p>
                            ))}
                          </div>

                          <div className="post-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className={`action-btn ${liked ? "is-active" : ""}`}
                              onClick={() => handleToggleLike(p.id)}
                              disabled={!viewerUuid}
                              title={!viewerUuid ? "いいねはログイン後に利用できます" : "いいね"}
                            >
                              ♥ <span className="action-count">{p.likeCount}</span>
                            </button>

                            <button
                              type="button"
                              className="action-btn"
                              onClick={() => router.push(`/posts/${p.id}`)}
                              title="返信を見る"
                            >
                              💬 <span className="action-count">{p.replyCount}</span>
                            </button>

                            <button type="button" className="action-btn danger" onClick={() => handleReportPost(p.id)}>
                              通報
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </main>

        <BottomNav active="mypage" hasUnread={false} />
      </div>

      <style jsx>{`
        .profile-hero {
          padding: 4px 0 12px;
          border-bottom: 1px solid var(--border);
          margin-bottom: 8px;
        }

        .profile-hero-row {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-bottom: 8px;
        }

        .profile-hero-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .profile-name-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: baseline;
        }

        .profile-name {
          font-size: 16px;
          font-weight: 600;
        }

        .profile-handle {
          font-size: 12px;
          color: var(--text-sub);
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .profile-meta-row {
          font-size: 11px;
          color: var(--text-sub);
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }

        .profile-tag {
          padding: 3px 8px;
          border-radius: 999px;
          border: 1px solid var(--border-soft, rgba(0, 0, 0, 0.08));
          font-size: 10px;
          background: var(--surface-soft, rgba(255, 255, 255, 0.9));
        }

        .profile-stats-row {
          font-size: 11px;
          color: var(--text-sub);
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .stats-link {
          color: inherit;
          text-decoration: none;
        }
        .stats-link:hover {
          opacity: 0.9;
        }

        .profile-intro {
          font-size: 13px;
          line-height: 1.7;
          margin-top: 6px;
        }

        .profile-notice {
          font-size: 11px;
          line-height: 1.6;
          margin-top: 4px;
          color: var(--text-sub);
        }

        .profile-sns-block {
          margin-top: 10px;
        }

        .profile-sns-title {
          font-size: 12px;
          color: var(--text-sub);
          margin-bottom: 4px;
        }

        .profile-sns-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .profile-sns-chip {
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-main);
          text-decoration: none;
        }

        .linked-store-block {
          margin-top: 12px;
        }

        .linked-store-title {
          font-size: 12px;
          color: var(--text-sub);
          margin-bottom: 6px;
        }

        .linked-store-card {
          border-radius: 16px;
          border: 1px solid var(--border-soft, rgba(0, 0, 0, 0.06));
          background: var(--surface-soft, rgba(255, 255, 255, 0.9));
          padding: 10px;
        }

        .linked-store-row {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .store-avatar {
          border: 1px solid rgba(0, 0, 0, 0.08);
        }

        .linked-store-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .linked-store-name {
          font-size: 13px;
          font-weight: 700;
          line-height: 1.2;
        }

        .linked-store-meta {
          font-size: 11px;
          color: var(--text-sub);
        }

        .linked-store-link-wrapper {
          text-decoration: none;
          color: inherit;
          cursor: pointer;
          transition: background-color 0.15s ease, box-shadow 0.15s ease;
          display: block;
        }

        .linked-store-link-wrapper:hover {
          background: rgba(0, 0, 0, 0.03);
        }

        .linked-store-link-wrapper:active {
          background: rgba(0, 0, 0, 0.06);
        }

        .therapist-posts-section {
          margin-top: 6px;
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

        .feed-item {
          border-bottom: 1px solid rgba(0, 0, 0, 0.04);
          padding: 10px 16px;
          cursor: pointer;
        }

        .feed-item:focus {
          outline: 2px solid rgba(0, 0, 0, 0.18);
          outline-offset: 2px;
          border-radius: 8px;
        }

        .feed-item-inner {
          display: flex;
          gap: 10px;
        }

        .feed-main {
          flex: 1;
          min-width: 0;
        }

        .feed-header {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
        }

        .feed-name-row {
          display: flex;
          align-items: baseline;
          gap: 6px;
          flex-wrap: wrap;
        }

        .post-name {
          font-weight: 600;
          font-size: 13px;
        }

        .post-username {
          font-size: 11px;
          color: var(--text-sub, #777777);
        }

        .post-meta {
          font-size: 11px;
          color: var(--text-sub, #777777);
          margin-top: 2px;
        }

        .post-body {
          font-size: 13px;
          line-height: 1.7;
          margin-top: 6px;
          margin-bottom: 6px;
        }

        .post-images {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
          margin-top: 8px;
        }

        .post-image {
          width: 100%;
          height: auto;
          border-radius: 12px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          display: block;
        }

        .post-actions {
          display: flex;
          gap: 10px;
          align-items: center;
          margin-top: 4px;
        }

        .action-btn {
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: var(--surface-soft, rgba(255, 255, 255, 0.92));
          border-radius: 999px;
          font-size: 12px;
          padding: 6px 10px;
          cursor: pointer;
        }

        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .action-btn.is-active {
          border-color: rgba(0, 0, 0, 0.18);
          font-weight: 700;
        }

        .action-count {
          margin-left: 4px;
        }

        .action-btn.danger {
          border-color: rgba(176, 0, 32, 0.25);
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
      `}</style>
    </>
  );
};

export default TherapistProfilePage;