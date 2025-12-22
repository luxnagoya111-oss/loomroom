// components/PostCard.tsx
"use client";

import React, { useMemo, useState } from "react";
import AvatarCircle from "@/components/AvatarCircle";
import PostActionsMenu from "@/components/PostActionsMenu";
import type { UiPost } from "@/lib/postFeedHydrator";
import type { UserId } from "@/types/user";

import { reportPost } from "@/lib/repositories/postRepository";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  post: UiPost;

  viewerReady: boolean;
  viewerUuid?: UserId | null;

  onOpenDetail: (postId: string) => void;
  onOpenProfile: (profilePath: string | null) => void;

  onToggleLike: (post: UiPost) => void | Promise<void>;
  onReply: (postId: string) => void;

  onDeleted?: (postId: string) => void;

  showBadges?: boolean;
};

const renderGoldBadge = (kind: UiPost["authorKind"]) => {
  if (kind === "therapist") return <span className="badge-gold">✦</span>;
  if (kind === "store") return <span className="badge-gold">🏛</span>;
  return null;
};

async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export default function PostCard(props: Props) {
  const {
    post,
    viewerReady,
    viewerUuid = null,
    onOpenDetail,
    onOpenProfile,
    onToggleLike,
    onReply,
    onDeleted,
    showBadges = true,
  } = props;

  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // UiPost.authorId は Home 側で mute/block 判定に使っている前提
  const isOwner = useMemo(() => {
    if (!viewerReady || !viewerUuid) return false;

    // ① canonical user id があれば最優先で使う
    const canonical =
      (post as any).canonicalUserId ??
      (post as any).canonical_user_id ??
      (post as any).authorUserId ??
      null;

    if (typeof canonical === "string" && canonical) {
      return canonical === viewerUuid;
    }

    // ② user投稿の場合のみ fallback
    if (post.authorKind === "user") {
      return post.authorId === viewerUuid;
    }

    return false;
  }, [viewerReady, viewerUuid, post]);

  const profileClickable = !!post.profilePath;

  const handleDelete = async () => {
    if (!viewerReady || busy) return;

    const ok = window.confirm("この投稿を削除しますか？");
    if (!ok) return;

    setBusy(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        alert("削除にはログインが必要です。");
        return;
      }

      const res = await fetch("/api/posts/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ postId: post.id }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        if (res.status === 403) {
          alert("この投稿を削除する権限がありません。");
          return;
        }
        if (res.status === 401) {
          alert("セッションが切れています。再ログインしてください。");
          return;
        }
        alert(`削除に失敗しました。(${j?.error ?? "unknown"})`);
        return;
      }

      setMenuOpen(false);
      onDeleted?.(post.id);
    } catch {
      alert("削除に失敗しました。通信状況を確認して再度お試しください。");
    } finally {
      setBusy(false);
    }
  };

  const handleReport = async () => {
    if (!viewerReady || busy) return;

    const ok = window.confirm("この投稿を通報しますか？");
    if (!ok) return;

    setBusy(true);
    try {
      // report は DB に書くので viewerUuid（uuid）が必要
      if (!viewerUuid) {
        alert("通報にはログインが必要です。");
        return;
      }

      const ok2 = await reportPost({ postId: post.id, reporterId: viewerUuid, reason: null });
      setMenuOpen(false);

      if (!ok2) {
        alert("通報の送信中にエラーが発生しました。時間をおいて再度お試しください。");
        return;
      }
      alert("この投稿の通報を受け付けました。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className="feed-item"
      role="button"
      tabIndex={0}
      aria-label="投稿の詳細を見る"
      onClick={() => onOpenDetail(post.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenDetail(post.id);
        }
      }}
    >
      <div className="feed-item-inner">
        <div
          className="feed-avatar-wrap"
          onClick={(e) => {
            e.stopPropagation();
            onOpenProfile(post.profilePath);
          }}
          style={{ cursor: profileClickable ? "pointer" : "default" }}
          role={profileClickable ? "button" : undefined}
          aria-label={profileClickable ? "プロフィールを見る" : undefined}
        >
          <AvatarCircle
            size={40}
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
              onOpenProfile(post.profilePath);
            }}
            style={{ cursor: profileClickable ? "pointer" : "default" }}
          >
            <div className="feed-name-row">
              <span className="post-name">{post.authorName}</span>
              {showBadges && renderGoldBadge(post.authorKind)}
            </div>
            {post.authorHandle && <div className="post-username">{post.authorHandle}</div>}
          </div>

          <div className="post-meta">
            <span className="post-time">{post.timeAgoText}</span>
          </div>

          <div className="post-body">
            {post.body.split("\n").map((line, idx) => (
              <p key={idx}>{line || <span style={{ opacity: 0.3 }}>　</span>}</p>
            ))}
          </div>

          {post.imageUrls.length > 0 && (
            <div className={`media-grid media-grid--${post.imageUrls.length}`} aria-label="投稿画像">
              {post.imageUrls.map((src, idx) => (
                <div className="media-tile" key={`${post.id}_${idx}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="投稿画像" loading="lazy" decoding="async" />
                </div>
              ))}
            </div>
          )}

          <div className="post-footer">
            <button
              type="button"
              className={`post-like-btn ${post.liked ? "liked" : ""}`}
              disabled={!viewerReady || busy}
              onClick={(e) => {
                e.stopPropagation();
                onToggleLike(post);
              }}
            >
              <span className="post-like-icon">♥</span>
              <span className="post-like-count">{post.likeCount}</span>
            </button>

            <button
              type="button"
              className="post-reply-btn"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                onReply(post.id);
              }}
            >
              <span className="post-reply-icon">💬</span>
              <span className="post-reply-count">{post.replyCount}</span>
            </button>

            {/* ★ 常に表示。開閉は PostCard 内部で管理 */}
            <PostActionsMenu
              open={menuOpen}
              onToggle={() => setMenuOpen((v) => !v)}
              isOwner={isOwner}
              viewerReady={viewerReady && !busy}
              onDelete={isOwner ? handleDelete : undefined}
              onReport={!isOwner ? handleReport : undefined}
            />
          </div>

          {!viewerReady && (
            <div className="feed-message" style={{ padding: "6px 0 0", fontSize: 11 }}>
              いいね・通報・削除はログイン後に利用できます。
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
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

        .post-body {
          font-size: 13px;
          line-height: 1.7;
          margin-top: 4px;
          margin-bottom: 4px;
        }

        .post-footer {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 6px;
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
        }

        .post-like-btn:disabled,
        .post-reply-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .post-like-btn.liked .post-like-icon {
          color: #e0245e;
        }

        .feed-message {
          font-size: 12px;
          padding: 8px 12px;
          color: var(--text-sub);
        }

        /* 画像グリッド */
        .media-grid {
          margin-top: 8px;
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
        }

        .media-tile img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
      `}</style>
    </article>
  );
}