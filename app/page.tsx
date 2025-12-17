// app/page.tsx
"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import AppHeader from "@/components/AppHeader";
import AvatarCircle from "@/components/AvatarCircle";
import { timeAgo } from "@/lib/timeAgo";
import { supabase } from "@/lib/supabaseClient";
import { getRelationsForUser } from "@/lib/repositories/relationRepository";
import type { UserId } from "@/types/user";
import type { DbRelationRow } from "@/types/db";
import { ensureViewerId } from "@/lib/auth";

type Area =
  | "北海道"
  | "東北"
  | "関東"
  | "中部"
  | "近畿"
  | "中国"
  | "四国"
  | "九州"
  | "沖縄";

type AuthorKind = "therapist" | "store" | "user";

type Post = {
  id: string;

  /**
   * ★重要：ここは「relations（mute/block）」に合わせて users.id（uuid）を入れる
   * therapist/store の posts.author_id が roleテーブルid の場合でも、ここは users.id に正規化する
   */
  authorId: string;

  authorName: string;
  authorKind: AuthorKind;

  /** 表示用のURL（http or public url） */
  avatarUrl?: string | null;

  area: Area;
  body: string;
  timeAgo: string;

  likeCount: number;
  liked: boolean;

  replyCount: number;

  /** プロフィール遷移先（therapist/storeは role id 優先） */
  profilePath: string | null;
};

type DbPostRow = {
  id: string;
  author_id: string | null; // users.id or therapists.id or stores.id の可能性あり
  author_kind: "therapist" | "store" | "user" | null;
  body: string | null;
  area: string | null;
  created_at: string;
  like_count: number | null;
  reply_count: number | null;
};

type DbUserRow = {
  id: string;
  name: string | null;
  role: "therapist" | "store" | "user" | null;
  avatar_url: string | null;
};

type DbTherapistLite = {
  id: string; // therapists.id
  user_id: string | null; // users.id
  display_name?: string | null;
  avatar_url?: string | null;
};

type DbStoreLite = {
  id: string; // stores.id
  owner_user_id: string | null; // users.id
  name?: string | null;
  avatar_url?: string | null;
};

type DbPostLikeRow = {
  post_id: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

const hasUnread = false;

const knownAreas: Area[] = [
  "北海道",
  "東北",
  "関東",
  "中部",
  "近畿",
  "中国",
  "四国",
  "九州",
  "沖縄",
];

const renderGoldBadge = (kind: AuthorKind) => {
  if (kind === "therapist") return <span className="badge-gold">✦</span>;
  if (kind === "store") return <span className="badge-gold">🏛</span>;
  return null;
};

const getHandle = (post: Post): string | null => {
  if (!post.authorId) return null;
  if (post.authorKind === "therapist")
    return `@therapist_${post.authorId.slice(0, 4)}`;
  if (post.authorKind === "store") return `@store_${post.authorId.slice(0, 4)}`;
  if (post.authorKind === "user") return `@user_${post.authorId.slice(0, 4)}`;
  return null;
};

const goToProfile = (post: Post) => {
  if (typeof window === "undefined") return;
  if (!post.profilePath) return;
  window.location.href = post.profilePath;
};

function normalizeAvatarUrl(v: any): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

function isProbablyHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * ★ avatars bucket
 */
const AVATAR_BUCKET = "avatars";

/**
 * URLとして使う前に「それっぽいゴミ」を弾く
 */
function looksValidAvatarUrl(v: string | null | undefined): boolean {
  const s = (v ?? "").trim();
  if (!s) return false;

  if (s.includes("/storage/v1/object/public/avatars")) {
    if (/\/public\/avatars\/?$/i.test(s)) return false;
  }

  return true;
}

/**
 * avatar_url が
 * - https://... ならそのまま
 * - それ以外（storage path）なら public URL に変換
 */
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

export default function LoomRoomHome() {
  const router = useRouter();

  const [currentUserId, setCurrentUserId] = useState<UserId>("");

  const [relations, setRelations] = useState<DbRelationRow[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [areaFilter, setAreaFilter] = useState<Area | "all">("all");
  const [kindFilter, setKindFilter] = useState<AuthorKind | "all">("all");
  const [openPostMenuId, setOpenPostMenuId] = useState<string | null>(null);

  // 1) viewerId を必ず uuid で確定（匿名含む）
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const id = await ensureViewerId(); // ★必ず uuid を返す
        if (cancelled) return;
        setCurrentUserId(id as UserId);
      } catch (e: any) {
        console.error("[home.ensureViewerId] error:", e);
        if (cancelled) return;
        setError(e?.message ?? "ログイン状態の初期化に失敗しました");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 2) relations は uuid のときだけ取得
  useEffect(() => {
    if (!isUuid(currentUserId)) {
      setRelations([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const rows = await getRelationsForUser(currentUserId as UserId);
        if (cancelled) return;
        setRelations(rows ?? []);
      } catch (e: any) {
        if (cancelled) return;
        console.error("[home.getRelationsForUser] error:", e);
        setRelations([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  // 3) タイムライン取得も uuid 確定後にだけ走らせる（重要）
  useEffect(() => {
    if (!isUuid(currentUserId)) return;

    let cancelled = false;

    const fetchTimelineFromSupabase = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: postData, error: postError } = await supabase
          .from("posts")
          .select(
            "id, author_id, author_kind, body, area, created_at, like_count, reply_count"
          )
          .order("created_at", { ascending: false })
          .limit(100);

        if (cancelled) return;

        if (postError) {
          console.error("Supabase TL error:", postError);
          setError(postError.message ?? "タイムラインの取得に失敗しました");
          setLoading(false);
          return;
        }

        const rows = (postData ?? []) as DbPostRow[];

        if (!rows.length) {
          setPosts([]);
          setLoading(false);
          return;
        }

        const rowsWithAuthor = rows.filter((r) => !!r.author_id && isUuid(r.author_id));

        if (!rowsWithAuthor.length) {
          setPosts([]);
          setLoading(false);
          return;
        }

        const authorIds = Array.from(
          new Set(
            rowsWithAuthor
              .map((r) => r.author_id)
              .filter((id): id is string => !!id)
          )
        );

        const therapistByUserId = new Map<string, DbTherapistLite>();
        const therapistById = new Map<string, DbTherapistLite>();
        const storeByOwnerId = new Map<string, DbStoreLite>();
        const storeById = new Map<string, DbStoreLite>();

        if (authorIds.length) {
          const { data: therByUserData, error: therByUserError } = await supabase
            .from("therapists")
            .select("id, user_id, display_name, avatar_url")
            .in("user_id", authorIds);

          if (therByUserError) {
            console.error("Supabase therapists(user_id) error:", therByUserError);
          } else {
            (therByUserData ?? []).forEach((t: any) => {
              const r = t as DbTherapistLite;
              if (r.user_id) therapistByUserId.set(r.user_id, r);
              therapistById.set(r.id, r);
            });
          }

          const { data: therByIdData, error: therByIdError } = await supabase
            .from("therapists")
            .select("id, user_id, display_name, avatar_url")
            .in("id", authorIds);

          if (therByIdError) {
            console.error("Supabase therapists(id) error:", therByIdError);
          } else {
            (therByIdData ?? []).forEach((t: any) => {
              const r = t as DbTherapistLite;
              if (r.user_id) therapistByUserId.set(r.user_id, r);
              therapistById.set(r.id, r);
            });
          }

          const { data: storeByOwnerData, error: storeByOwnerError } = await supabase
            .from("stores")
            .select("id, owner_user_id, name, avatar_url")
            .in("owner_user_id", authorIds);

          if (storeByOwnerError) {
            console.error("Supabase stores(owner_user_id) error:", storeByOwnerError);
          } else {
            (storeByOwnerData ?? []).forEach((s: any) => {
              const r = s as DbStoreLite;
              if (r.owner_user_id) storeByOwnerId.set(r.owner_user_id, r);
              storeById.set(r.id, r);
            });
          }

          const { data: storeByIdData, error: storeByIdError } = await supabase
            .from("stores")
            .select("id, owner_user_id, name, avatar_url")
            .in("id", authorIds);

          if (storeByIdError) {
            console.error("Supabase stores(id) error:", storeByIdError);
          } else {
            (storeByIdData ?? []).forEach((s: any) => {
              const r = s as DbStoreLite;
              if (r.owner_user_id) storeByOwnerId.set(r.owner_user_id, r);
              storeById.set(r.id, r);
            });
          }
        }

        const resolvedUserIds = new Set<string>(authorIds);
        therapistById.forEach((t) => {
          if (t.user_id) resolvedUserIds.add(t.user_id);
        });
        storeById.forEach((s) => {
          if (s.owner_user_id) resolvedUserIds.add(s.owner_user_id);
        });

        const userMap = new Map<string, DbUserRow>();
        const userIdsToFetch = Array.from(resolvedUserIds).filter((id) => isUuid(id));
        if (userIdsToFetch.length) {
          const { data: userData, error: userError } = await supabase
            .from("users")
            .select("id, name, role, avatar_url")
            .in("id", userIdsToFetch);

          if (userError) {
            console.error("Supabase users fetch error:", userError);
          } else {
            (userData ?? []).forEach((u) => userMap.set(u.id, u as DbUserRow));
          }
        }

        // likes（viewer uuid 前提）
        const effectiveUserIdForDb = currentUserId;

        let likedIdSet = new Set<string>();
        const { data: likeData, error: likeError } = await supabase
          .from("post_likes")
          .select("post_id")
          .eq("user_id", effectiveUserIdForDb);

        if (likeError) {
          console.error("Supabase likes fetch error:", likeError);
        } else {
          const likeRows = (likeData ?? []) as DbPostLikeRow[];
          likedIdSet = new Set(likeRows.map((r) => r.post_id));
        }

        const mapped: Post[] = rowsWithAuthor.map((row) => {
          const rawAuthorId = row.author_id!;

          const inferredKind: AuthorKind =
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

          const user = userMap.get(canonicalUserId) ?? null;

          const area: Area = knownAreas.includes((row.area ?? "") as Area)
            ? ((row.area as Area) ?? "中部")
            : "中部";

          const likeCount = row.like_count ?? 0;
          const liked = likedIdSet.has(row.id);

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

          let profilePath: string | null = null;
          if (inferredKind === "therapist") {
            const therapistId = therapist?.id ?? null;
            profilePath = therapistId
              ? `/therapist/${therapistId}`
              : `/mypage/${canonicalUserId}`;
          } else if (inferredKind === "store") {
            const storeId = store?.id ?? null;
            profilePath = storeId ? `/store/${storeId}` : `/mypage/${canonicalUserId}`;
          } else {
            profilePath = `/mypage/${canonicalUserId}`;
          }

          const roleRaw =
            inferredKind === "therapist"
              ? therapist?.avatar_url ?? null
              : inferredKind === "store"
              ? store?.avatar_url ?? null
              : null;

          const userRaw = user?.avatar_url ?? null;

          const roleAvatar = looksValidAvatarUrl(roleRaw) ? resolveAvatarUrl(roleRaw) : null;
          const userAvatar = looksValidAvatarUrl(userRaw) ? resolveAvatarUrl(userRaw) : null;

          return {
            id: row.id,
            authorId: canonicalUserId,
            authorName,
            authorKind: inferredKind,
            avatarUrl: roleAvatar ?? userAvatar ?? null,
            area,
            body: row.body ?? "",
            timeAgo: timeAgo(row.created_at),
            likeCount,
            liked,
            replyCount: row.reply_count ?? 0,
            profilePath,
          };
        });

        if (cancelled) return;
        setPosts(mapped);
        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        console.error("Supabase TL unexpected error:", e);
        setError(e?.message ?? "不明なエラーが発生しました");
        setLoading(false);
      }
    };

    void fetchTimelineFromSupabase();

    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  const handleToggleLike = async (post: Post) => {
    if (!isUuid(currentUserId)) return;

    const previousLiked = post.liked;
    const previousCount = post.likeCount;
    const effectiveUserIdForDb = currentUserId;

    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? {
              ...p,
              liked: !previousLiked,
              likeCount: previousCount + (!previousLiked ? 1 : -1),
            }
          : p
      )
    );

    try {
      if (!previousLiked) {
        const { error: likeError } = await supabase.from("post_likes").insert([
          { post_id: post.id, user_id: effectiveUserIdForDb },
        ]);
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
          .eq("user_id", effectiveUserIdForDb);
        if (deleteError) throw deleteError;

        const { error: updateError } = await supabase
          .from("posts")
          .update({ like_count: Math.max(previousCount - 1, 0) })
          .eq("id", post.id);
        if (updateError) throw updateError;
      }
    } catch (e: any) {
      console.error("Supabase like toggle error:", e);

      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id ? { ...p, liked: previousLiked, likeCount: previousCount } : p
        )
      );

      alert(
        e?.message ??
          "いいねの反映中にエラーが発生しました。時間をおいて再度お試しください。"
      );
    }
  };

  const handleReportPost = async (postId: string) => {
    if (!isUuid(currentUserId)) return;

    const effectiveUserIdForDb = currentUserId;

    try {
      const { error } = await supabase.from("reports").insert([
        {
          target_type: "post",
          target_id: postId,
          reporter_id: effectiveUserIdForDb,
          reason: null,
        },
      ]);

      if (error) {
        console.error("Supabase report insert error:", error);
        alert(
          (error as any)?.message ??
            "通報の送信中にエラーが発生しました。時間をおいて再度お試しください。"
        );
        return;
      }

      alert("この投稿の通報を受け付けました。");
    } catch (e: any) {
      console.error("Supabase report unexpected error:", e);
      alert(
        e?.message ??
          "通報の送信中に不明なエラーが発生しました。時間をおいて再度お試しください。"
      );
    } finally {
      setOpenPostMenuId(null);
    }
  };

  const filteredPosts = useMemo(() => {
    const mutedTargets = new Set<string>();
    const blockedTargets = new Set<string>();

    relations.forEach((r) => {
      if (r.type === "mute") mutedTargets.add(r.target_id);
      if (r.type === "block") blockedTargets.add(r.target_id);
    });

    return posts.filter((post) => {
      if (areaFilter !== "all" && post.area !== areaFilter) return false;
      if (kindFilter !== "all" && post.authorKind !== kindFilter) return false;
      if (mutedTargets.has(post.authorId)) return false;
      if (blockedTargets.has(post.authorId)) return false;
      return true;
    });
  }, [posts, areaFilter, kindFilter, relations]);

  const viewerReady = isUuid(currentUserId);

  return (
    <div className="page-root">
      <AppHeader title="LRoom" />

      <main className="page-main">
        <section className="feed-filters">
          <div className="filter-group">
            <label className="filter-label">エリア</label>
            <select
              className="filter-select"
              value={areaFilter}
              onChange={(e) =>
                setAreaFilter(
                  e.target.value === "all" ? "all" : (e.target.value as Area)
                )
              }
            >
              <option value="all">すべて</option>
              <option value="北海道">北海道</option>
              <option value="東北">東北</option>
              <option value="関東">関東</option>
              <option value="中部">中部</option>
              <option value="近畿">近畿</option>
              <option value="中国">中国</option>
              <option value="四国">四国</option>
              <option value="九州">九州</option>
              <option value="沖縄">沖縄</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">表示</label>
            <select
              className="filter-select"
              value={kindFilter}
              onChange={(e) =>
                setKindFilter(
                  e.target.value === "all" ? "all" : (e.target.value as AuthorKind)
                )
              }
            >
              <option value="all">すべて</option>
              <option value="therapist">セラピスト</option>
              <option value="store">店舗</option>
              <option value="user">ユーザー</option>
            </select>
          </div>
        </section>

        <section className="feed-list">
          {error && (
            <div className="feed-message feed-error">
              タイムラインの読み込みに失敗しました：{error}
            </div>
          )}
          {loading && !error && (
            <div className="feed-message feed-loading">
              タイムラインを読み込んでいます…
            </div>
          )}

          {!loading && !error && filteredPosts.length === 0 && (
            <div className="feed-message">まだ投稿がありません。</div>
          )}

          {filteredPosts.map((post) => {
            const handle = getHandle(post);
            const profileClickable = !!post.profilePath;

            return (
              <article
                key={post.id}
                className="feed-item"
                role="button"
                tabIndex={0}
                aria-label="投稿の詳細を見る"
                onClick={() => router.push(`/posts/${post.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/posts/${post.id}`);
                  }
                }}
              >
                <div className="feed-item-inner">
                  <div
                    className="feed-avatar-wrap"
                    onClick={(e) => {
                      e.stopPropagation();
                      goToProfile(post);
                    }}
                    style={{ cursor: profileClickable ? "pointer" : "default" }}
                    role={profileClickable ? "button" : undefined}
                    aria-label={profileClickable ? "プロフィールを見る" : undefined}
                  >
                    <AvatarCircle
                      size={36}
                      avatarUrl={post.avatarUrl}
                      displayName={post.authorName}
                      alt={post.authorName}
                    />
                  </div>

                  <div className="feed-main">
                    <div
                      className="feed-header"
                      onClick={(e) => {
                        e.stopPropagation();
                        goToProfile(post);
                      }}
                      style={{ cursor: profileClickable ? "pointer" : "default" }}
                    >
                      <div className="feed-name-row">
                        <span className="post-name">{post.authorName}</span>
                        {renderGoldBadge(post.authorKind)}
                      </div>
                      {handle && <div className="post-username">{handle}</div>}
                    </div>

                    <div className="post-meta">
                      <span className="post-area">{post.area}</span>
                      <span className="post-dot">・</span>
                      <span className="post-time">{post.timeAgo}</span>
                    </div>

                    <div className="post-body">
                      {post.body.split("\n").map((line, idx) => (
                        <p key={idx}>{line || <span style={{ opacity: 0.3 }}>　</span>}</p>
                      ))}
                    </div>

                    <div className="post-footer">
                      <button
                        type="button"
                        className={`post-like-btn ${post.liked ? "liked" : ""}`}
                        disabled={!viewerReady}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleToggleLike(post);
                        }}
                      >
                        <span className="post-like-icon">♥</span>
                        <span className="post-like-count">{post.likeCount}</span>
                      </button>

                      <button
                        type="button"
                        className="post-reply-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          alert("返信機能はこれから実装予定です（現在はテスト用です）。");
                        }}
                      >
                        <span className="post-reply-icon">💬</span>
                        <span className="post-reply-count">{post.replyCount}</span>
                      </button>

                      <div className="post-more-wrapper">
                        <button
                          type="button"
                          className="post-more-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenPostMenuId(openPostMenuId === post.id ? null : post.id);
                          }}
                        >
                          ⋯
                        </button>

                        {openPostMenuId === post.id && (
                          <div className="post-more-menu">
                            <button
                              type="button"
                              className="post-report-btn"
                              disabled={!viewerReady}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleReportPost(post.id);
                              }}
                            >
                              通報する
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
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
          padding-bottom: 64px;
        }

        .feed-filters {
          display: flex;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
        }

        .filter-label {
          font-size: 11px;
          color: var(--text-sub, #777);
          margin-bottom: 4px;
        }

        .filter-select {
          font-size: 13px;
          padding: 4px 6px;
          border-radius: 6px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: #fff;
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

        .feed-avatar-wrap {
          width: 36px;
          height: 36px;
          flex: 0 0 36px;
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
          align-items: center;
          gap: 4px;
        }

        .post-name {
          font-weight: 600;
          font-size: 13px;
        }

        .badge-gold {
          font-size: 12px;
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

        .post-dot {
          margin: 0 4px;
        }

        .post-footer {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 6px;
        }

        .post-like-btn,
        .post-reply-btn,
        .post-more-btn {
          border: none;
          background: transparent;
          padding: 2px 4px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--text-sub, #777777);
        }

        .post-like-btn:disabled,
        .post-report-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .post-like-btn.liked .post-like-icon {
          color: #e0245e;
        }

        .post-more-wrapper {
          margin-left: auto;
          position: relative;
        }

        .post-more-menu {
          position: absolute;
          right: 0;
          top: 18px;
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.16);
          padding: 4px 0;
          z-index: 10;
        }

        .post-report-btn {
          background: transparent;
          border: none;
          font-size: 12px;
          padding: 6px 12px;
          width: 100%;
          text-align: left;
          color: #b00020;
        }

        .post-report-btn:hover {
          background: rgba(176, 0, 32, 0.06);
        }

        .post-body {
          font-size: 13px;
          line-height: 1.7;
          margin-top: 4px;
          margin-bottom: 4px;
        }

        .feed-message {
          font-size: 12px;
          padding: 8px 12px;
          color: var(--text-sub);
        }

        .feed-error {
          color: #b00020;
        }
      `}</style>
    </div>
  );
}