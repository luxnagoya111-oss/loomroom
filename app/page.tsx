// app/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import BottomNav from "@/components/BottomNav";
import AppHeader from "@/components/AppHeader";
import PostCard from "@/components/PostCard";

import { getRelationsForUser } from "@/lib/repositories/relationRepository";
import type { DbRelationRow } from "@/types/db";
import type { UserId } from "@/types/user";
import { ensureViewerId, getCurrentUserId } from "@/lib/auth";

import { fetchRecentPosts, toggleLike } from "@/lib/repositories/postRepository";
import { hydratePosts, type UiPost } from "@/lib/postFeedHydrator";

type AuthorKind = "therapist" | "store" | "user";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

const hasUnread = false;

export default function LoomRoomHome() {
  const router = useRouter();

  const [currentUserId, setCurrentUserId] = useState<UserId>("");
  const [viewerUuid, setViewerUuid] = useState<UserId | null>(null);

  const [relations, setRelations] = useState<DbRelationRow[]>([]);
  const [posts, setPosts] = useState<UiPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kindFilter, setKindFilter] = useState<AuthorKind | "all">("all");

  // 画面ID（guestでも）
  useEffect(() => {
    setCurrentUserId(getCurrentUserId());
  }, []);

  // DB操作用 uuid
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const uid = await ensureViewerId();
        if (!cancelled) setViewerUuid(uid);
      } catch {
        if (!cancelled) setViewerUuid(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const viewerReady = !!viewerUuid && isUuid(viewerUuid);

  // relations（uuid時だけ）
  useEffect(() => {
    if (!viewerReady || !viewerUuid) {
      setRelations([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const rows = await getRelationsForUser(viewerUuid as UserId);
        if (!cancelled) setRelations(rows ?? []);
      } catch {
        if (!cancelled) setRelations([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewerReady, viewerUuid]);

  // TL取得 → hydrate
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const rows = await fetchRecentPosts({ limit: 100, excludeReplies: true });
        const ui = await hydratePosts({
          rows,
          viewerUuid: viewerReady && viewerUuid ? viewerUuid : null,
        });
        if (!cancelled) setPosts(ui);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "タイムラインの取得に失敗しました");
          setPosts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewerReady, viewerUuid]);

  const filteredPosts = useMemo(() => {
    const mutedTargets = new Set<string>();
    const blockedTargets = new Set<string>();

    relations.forEach((r) => {
      if (r.type === "mute") mutedTargets.add(r.target_id);
      if (r.type === "block") blockedTargets.add(r.target_id);
    });

    return posts.filter((p) => {
      if (kindFilter !== "all" && p.authorKind !== kindFilter) return false;
      if (mutedTargets.has(p.authorId)) return false;
      if (blockedTargets.has(p.authorId)) return false;
      return true;
    });
  }, [posts, kindFilter, relations]);

  const handleToggleLike = async (post: UiPost) => {
    if (!viewerReady || !viewerUuid) return;

    const prevLiked = post.liked;
    const prevCount = post.likeCount;

    // optimistic
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, liked: !prevLiked, likeCount: prevCount + (!prevLiked ? 1 : -1) }
          : p
      )
    );

    const res = await toggleLike({
      postId: post.id,
      userId: viewerUuid,
      nextLiked: !prevLiked,
      currentLikeCount: prevCount,
    });

    if (!res.ok) {
      // rollback
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, liked: prevLiked, likeCount: prevCount } : p))
      );
      alert("いいねの反映中にエラーが発生しました。時間をおいて再度お試しください。");
    }
  };

  const handleDeleted = (postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  return (
    <div className="page-root">
      <AppHeader title="LRoom" />

      <main className="page-main">
        <section className="feed-filters">
          <div className="filter-group">
            <label className="filter-label">表示</label>
            <select
              className="filter-select"
              value={kindFilter}
              onChange={(e) =>
                setKindFilter(e.target.value === "all" ? "all" : (e.target.value as AuthorKind))
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
            <div className="feed-message feed-loading">タイムラインを読み込んでいます…</div>
          )}
          {!loading && !error && filteredPosts.length === 0 && (
            <div className="feed-message">まだ投稿がありません。</div>
          )}

          {filteredPosts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              viewerReady={viewerReady}
              viewerUuid={viewerUuid}
              onOpenDetail={(id) => router.push(`/posts/${id}`)}
              onOpenProfile={(path) => {
                if (!path) return;
                router.push(path);
              }}
              onToggleLike={handleToggleLike}
              onReply={(id) => router.push(`/posts/${id}?reply=1`)}
              onDeleted={handleDeleted}
              showBadges
            />
          ))}
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

        .feed-message {
          font-size: 12px;
          padding: 12px 16px;
          color: var(--text-sub, #777);
        }

        .feed-error {
          color: #b00020;
        }
      `}</style>
    </div>
  );
}