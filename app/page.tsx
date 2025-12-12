// app/page.tsx
"use client";

import React, { useState, useMemo, useEffect } from "react";
import BottomNav from "@/components/BottomNav";
import AppHeader from "@/components/AppHeader";
import { getCurrentUserId } from "@/lib/auth";
import { timeAgo } from "@/lib/timeAgo";
import { supabase } from "@/lib/supabaseClient";
import {
  getRelationsForUser,
} from "@/lib/repositories/relationRepository";
import type { UserId } from "@/types/user";
import type { DbRelationRow } from "@/types/db";

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
  authorId: string; // users.id（uuid） or demo用文字列
  authorName: string;
  authorKind: AuthorKind;
  avatarUrl?: string | null;
  area: Area;
  body: string;
  timeAgo: string;
  likeCount: number;
  liked: boolean;
  replyCount: number;
  profilePath: string | null; // ★ 追加：プロフィールに飛ぶURL
};

// Supabase posts テーブルから取得する行
type DbPostRow = {
  id: string;
  author_id: string | null;
  author_kind: "therapist" | "store" | "user" | null;
  body: string | null;
  area: string | null;
  created_at: string;
  like_count: number | null;
  reply_count: number | null;
};

// Supabase users テーブルの最小限
type DbUserRow = {
  id: string;
  name: string | null;
  role: "therapist" | "store" | "user" | null;
  avatar_url: string | null;
};

// therapists テーブル（IDマッピング用）
type DbTherapistIdRow = {
  id: string;
  user_id: string | null;
};

// stores テーブル（IDマッピング用）
type DbStoreIdRow = {
  id: string;
  owner_user_id: string | null;
};

// post_likes テーブル用
type DbPostLikeRow = {
  post_id: string;
};

// relations 用：uuid 判定
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

// ★ ゲストのいいね用ダミーID（DB側のポリシー次第で後で変えてOK）
const GUEST_DB_USER_ID = "00000000-0000-0000-0000-000000000000";

const hasUnread = false;

// 初期表示用のデモ投稿
const DEMO_POSTS: Post[] = [
  {
    id: "demo_p1",
    authorId: "taki",
    authorName: "TAKI",
    authorKind: "therapist",
    area: "中部",
    body: "少し寒い日が続いていますね。\n\nあったかいお風呂と、\nふわっと力を抜いて過ごせる時間、\nどこかでちゃんと作れていますか？",
    timeAgo: "3時間前",
    likeCount: 12,
    liked: false,
    replyCount: 3,
    profilePath: "/therapist/taki", // デモ用：従来通り id = "taki"
  },
  {
    id: "demo_p2",
    authorId: "loomroom",
    authorName: "LoomRoom運営",
    authorKind: "store",
    area: "中部",
    body: "LoomRoom はまだプレ版の空間ですが、\n\n「女風界隈の、静かな居場所」\n\nとして少しずつ整えていきます。",
    timeAgo: "1日前",
    likeCount: 23,
    liked: false,
    replyCount: 5,
    profilePath: "/store/loomroom",
  },
  {
    id: "demo_p3",
    authorId: "u_demo",
    authorName: "名無しユーザー",
    authorKind: "user",
    area: "関東",
    body: "最近ちょっと、女風のことを誰かと話したくて。\n\nまだ勇気は出てないけど、\nここを見つけてから、少しだけ気持ちが楽になりました。",
    timeAgo: "2日前",
    likeCount: 5,
    liked: false,
    replyCount: 1,
    profilePath: "/mypage/u_demo",
  },
];

// 認証バッジ（セラピスト ✦ / 店舗 🏛）
const renderGoldBadge = (kind: AuthorKind) => {
  if (kind === "therapist") return <span className="badge-gold">✦</span>;
  if (kind === "store") return <span className="badge-gold">🏛</span>;
  return null;
};

// ちょっとしたハンドル名
const getHandle = (post: Post): string | null => {
  if (!post.authorId) return null;

  if (post.authorKind === "therapist") {
    return `@therapist_${post.authorId.slice(0, 4)}`;
  }
  if (post.authorKind === "store") {
    return `@store_${post.authorId.slice(0, 4)}`;
  }
  if (post.authorKind === "user") {
    return `@user_${post.authorId.slice(0, 4)}`;
  }
  return null;
};

// プロフィール遷移（Post 単位で扱うように変更）
const goToProfile = (post: Post) => {
  if (typeof window === "undefined") return;
  if (!post.profilePath) return;
  window.location.href = post.profilePath;
};

export default function LoomRoomHome() {
  const [currentUserId, setCurrentUserId] = useState<UserId>("");

  // relations（自分 → 相手）一覧
  const [relations, setRelations] = useState<DbRelationRow[]>([]);

  // 初期状態は DEMO_POSTS
  const [posts, setPosts] = useState<Post[]>(DEMO_POSTS);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // フィルタ状態
  const [areaFilter, setAreaFilter] = useState<Area | "all">("all");
  const [kindFilter, setKindFilter] = useState<AuthorKind | "all">("all");

  // 通報メニュー用：開いているポストID
  const [openPostMenuId, setOpenPostMenuId] = useState<string | null>(null);

  // ログインIDの確定（クライアント側）
  useEffect(() => {
    const id = getCurrentUserId();
    setCurrentUserId(id as UserId);
  }, []);

  // relations 取得（uuid 会員のみ）
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

  // Supabase から TL を読み込む（posts + users + post_likes + therapists/stores ID）
  useEffect(() => {
    let cancelled = false;

    const fetchTimelineFromSupabase = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1) 投稿本体
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

        // 投稿がない場合は DEMO のまま
        if (!rows.length) {
          setPosts(DEMO_POSTS);
          setLoading(false);
          return;
        }

        // 2) 著者ID一覧 → users を取得
        const authorIds = Array.from(
          new Set(
            rows
              .map((r) => r.author_id)
              .filter((id): id is string => !!id)
          )
        );

        const userMap = new Map<string, DbUserRow>();

        if (authorIds.length) {
          const { data: userData, error: userError } = await supabase
            .from("public_profiles")
            .select("id, name, role, avatar_url")
            .in("id", authorIds);

          if (userError) {
            console.error("Supabase users join error:", userError);
          } else {
            (userData ?? []).forEach((u) => {
              userMap.set(u.id, u as DbUserRow);
            });
          }
        }

        // 3) セラピストID・店舗ID マッピング
        const therapistUserIds: string[] = [];
        const storeUserIds: string[] = [];

        userMap.forEach((u) => {
          if (u.role === "therapist") {
            therapistUserIds.push(u.id);
          } else if (u.role === "store") {
            storeUserIds.push(u.id);
          }
        });

        const therapistRouteMap = new Map<string, string>(); // user_id → therapists.id
        const storeRouteMap = new Map<string, string>(); // owner_user_id → stores.id

        if (therapistUserIds.length) {
          const { data: therData, error: therError } = await supabase
            .from("therapists")
            .select("id, user_id")
            .in("user_id", therapistUserIds);

          if (therError) {
            console.error("Supabase therapist id map error:", therError);
          } else {
            (therData ?? []).forEach((t) => {
              const row = t as DbTherapistIdRow;
              if (row.user_id) {
                therapistRouteMap.set(row.user_id, row.id);
              }
            });
          }
        }

        if (storeUserIds.length) {
          const { data: storeData, error: storeError } = await supabase
            .from("stores")
            .select("id, owner_user_id")
            .in("owner_user_id", storeUserIds);

          if (storeError) {
            console.error("Supabase store id map error:", storeError);
          } else {
            (storeData ?? []).forEach((s) => {
              const row = s as DbStoreIdRow;
              if (row.owner_user_id) {
                storeRouteMap.set(row.owner_user_id, row.id);
              }
            });
          }
        }

        // 4) 自分がいいねした投稿一覧（post_likes）
        const effectiveUserIdForDb = isUuid(currentUserId)
          ? currentUserId
          : GUEST_DB_USER_ID;

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

        // 5) TL データを最終形にマッピング
        const mapped: Post[] = rows.map((row) => {
          const user = row.author_id ? userMap.get(row.author_id) : undefined;

          // role は posts.author_kind を優先、なければ users.role
          const roleFromPost = row.author_kind ?? "user";
          const roleFromUser = user?.role ?? "user";
          const kind: AuthorKind =
            roleFromPost === "therapist" || roleFromUser === "therapist"
              ? "therapist"
              : roleFromPost === "store" || roleFromUser === "store"
              ? "store"
              : "user";

          const area: Area = knownAreas.includes(
            (row.area ?? "") as Area
          )
            ? ((row.area as Area) ?? "中部")
            : "中部";

          const likeCount = row.like_count ?? 0;
          const liked = likedIdSet.has(row.id);

          const authorId = row.author_id ?? "guest";
          const authorName =
            user?.name ??
            (kind === "store"
              ? "店舗アカウント"
              : kind === "therapist"
              ? "セラピスト"
              : "名無し");

          // ★ プロフィールURLの決定
          let profilePath: string | null = null;
          if (kind === "therapist") {
            if (isUuid(authorId)) {
              const therapistId = therapistRouteMap.get(authorId);
              profilePath = therapistId
                ? `/therapist/${therapistId}`
                : `/therapist/${authorId}`; // 万一マッピングない場合のフォールバック
            } else {
              // デモなど従来形式
              profilePath = `/therapist/${authorId}`;
            }
          } else if (kind === "store") {
            if (isUuid(authorId)) {
              const storeId = storeRouteMap.get(authorId);
              profilePath = storeId
                ? `/store/${storeId}`
                : `/store/${authorId}`;
            } else {
              profilePath = `/store/${authorId}`;
            }
          } else {
            // 一般ユーザーは users.id ベースで /mypage/[id]
            profilePath = `/mypage/${authorId}`;
          }

          return {
            id: row.id,
            authorId,
            authorName,
            authorKind: kind,
            avatarUrl: user?.avatar_url ?? null,
            area,
            body: row.body ?? "",
            timeAgo: timeAgo(row.created_at),
            likeCount,
            liked,
            replyCount: row.reply_count ?? 0,
            profilePath,
          };
        });

        setPosts(mapped);
        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        console.error("Supabase TL unexpected error:", e);
        setError(e?.message ?? "不明なエラーが発生しました");
        setLoading(false);
      }
    };

    fetchTimelineFromSupabase();

    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  // いいね ON/OFF（Supabase 連携）は元のまま（省略せずに残す）
  const handleToggleLike = async (post: Post) => {
    const previousLiked = post.liked;
    const previousCount = post.likeCount;

    const effectiveUserIdForDb = isUuid(currentUserId)
      ? currentUserId
      : GUEST_DB_USER_ID;

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
          {
            post_id: post.id,
            user_id: effectiveUserIdForDb,
          },
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
          p.id === post.id
            ? { ...p, liked: previousLiked, likeCount: previousCount }
            : p
        )
      );

      alert(
        e?.message ??
          "いいねの反映中にエラーが発生しました。時間をおいて再度お試しください。"
      );
    }
  };

  // 通報処理
  const handleReportPost = async (postId: string) => {
    const effectiveUserIdForDb = isUuid(currentUserId)
      ? currentUserId
      : GUEST_DB_USER_ID;

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

  // フィルタ + relations（ミュート / ブロック）除外
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

  return (
    <div className="page-root">
      <AppHeader title="LoomRoom" />
      <main className="page-main">
        {/* フィルタエリア（元のまま） */}
        {/* ... ここから下は JSX はほぼ元のまま ... */}
        <section className="feed-filters">
          {/* （中略：フィルタUI） */}
          <div className="filter-group">
            <label className="filter-label">エリア</label>
            <select
              className="filter-select"
              value={areaFilter}
              onChange={(e) =>
                setAreaFilter(
                  e.target.value === "all"
                    ? "all"
                    : (e.target.value as Area)
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
                  e.target.value === "all"
                    ? "all"
                    : (e.target.value as AuthorKind)
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

        {/* タイムライン本体 */}
        <section className="feed-list">
          {error && (
            <div className="feed-message feed-error">
              タイムラインの読み込みに失敗しました：{error}
            </div>
          )}
          {loading && !error && (
            <div className="feed-message feed-loading">
              タイムラインを読み込んでいます…</div>
          )}

          {filteredPosts.map((post) => {
            const handle = getHandle(post);
            const profileClickable = !!post.profilePath;

            return (
              <article key={post.id} className="feed-item">
                <div className="feed-item-inner">
                  {/* 左：アイコン（タップでプロフィールへ） */}
                  <div
                    className="avatar"
                    onClick={(e) => {
                      e.stopPropagation();
                      goToProfile(post);
                    }}
                    style={{
                      cursor: profileClickable ? "pointer" : "default",
                    }}
                  >
                    {post.avatarUrl ? (
                      <img
                        src={post.avatarUrl}
                        alt={post.authorName}
                        className="avatar-img"
                      />
                    ) : post.authorKind === "therapist" ? (
                      "🧑‍🦱"
                    ) : post.authorKind === "store" ? (
                      "🏬"
                    ) : (
                      "🙂"
                    )}
                  </div>

                  {/* 右：本文 */}
                  <div className="feed-main">
                    {/* 名前／ハンドルもタップでプロフィール */}
                    <div
                      className="feed-header"
                      onClick={(e) => {
                        e.stopPropagation();
                        goToProfile(post);
                      }}
                      style={{
                        cursor: profileClickable ? "pointer" : "default",
                      }}
                    >
                      <div className="feed-name-row">
                        <span className="post-name">{post.authorName}</span>
                        {renderGoldBadge(post.authorKind)}
                      </div>
                      {handle && (
                        <div className="post-username">{handle}</div>
                      )}
                    </div>

                    <div className="post-meta">
                      <span className="post-area">{post.area}</span>
                      <span className="post-dot">・</span>
                      <span className="post-time">{post.timeAgo}</span>
                    </div>

                    <div className="post-body">
                      {post.body.split("\n").map((line, idx) => (
                        <p key={idx}>
                          {line || (
                            <span style={{ opacity: 0.3 }}>　</span>
                          )}
                        </p>
                      ))}
                    </div>

                    <div className="post-footer">
                      <button
                        type="button"
                        className={`post-like-btn ${
                          post.liked ? "liked" : ""
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleToggleLike(post);
                        }}
                      >
                        <span className="post-like-icon">♥</span>
                        <span className="post-like-count">
                          {post.likeCount}
                        </span>
                      </button>

                      <button
                        type="button"
                        className="post-reply-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          alert(
                            "返信機能はこれから実装予定です（現在はテスト用です）。"
                          );
                        }}
                      >
                        <span className="post-reply-icon">💬</span>
                        <span className="post-reply-count">
                          {post.replyCount}
                        </span>
                      </button>

                      {/* ・・・メニュー（通報ボタン） */}
                      <div className="post-more-wrapper">
                        <button
                          type="button"
                          className="post-more-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenPostMenuId(
                              openPostMenuId === post.id ? null : post.id
                            );
                          }}
                        >
                          ⋯
                        </button>

                        {openPostMenuId === post.id && (
                          <div className="post-more-menu">
                            <button
                              type="button"
                              className="post-report-btn"
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

      <BottomNav
        active="home"
        hasUnread={hasUnread}
      />

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

        .feed-list {
          padding: 0;
        }

        .feed-item {
          border-bottom: 1px solid rgba(0, 0, 0, 0.04);
          padding: 10px 16px;
        }

        .feed-item-inner {
          display: flex;
          gap: 10px;
        }

        .avatar {
          width: 36px;
          height: 36px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.04);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          overflow: hidden;
        }

        .avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
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

        .post-area {
          font-weight: 500;
        }

        .post-dot {
          margin: 0 4px;
        }

        .post-time {
          opacity: 0.8;
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

        .post-like-btn.liked .post-like-icon {
          color: #e0245e;
        }

        .post-like-icon {
          font-size: 14px;
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