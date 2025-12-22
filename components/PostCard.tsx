// components/PostCard.tsx
"use client";

import React from "react";
import AvatarCircle from "@/components/AvatarCircle";
import type { UiPost } from "@/lib/postFeedHydrator";

type Props = {
  post: UiPost;

  viewerReady: boolean;

  onOpenDetail: (postId: string) => void;
  onOpenProfile: (profilePath: string | null) => void;

  onToggleLike: (post: UiPost) => void;
  onReply: (postId: string) => void;

  onOpenMenu?: (postId: string) => void;
  menuOpen?: boolean;
  onReport?: (postId: string) => void;

  showBadges?: boolean;
};

const renderGoldBadge = (kind: UiPost["authorKind"]) => {
  if (kind === "therapist") return <span className="badge-gold">✦</span>;
  if (kind === "store") return <span className="badge-gold">🏛</span>;
  return null;
};

export default function PostCard(props: Props) {
  const {
    post,
    viewerReady,
    onOpenDetail,
    onOpenProfile,
    onToggleLike,
    onReply,
    onOpenMenu,
    menuOpen,
    onReport,
    showBadges = true,
  } = props;

  const profileClickable = !!post.profilePath;

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
              disabled={!viewerReady}
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
              onClick={(e) => {
                e.stopPropagation();
                onReply(post.id);
              }}
            >
              <span className="post-reply-icon">💬</span>
              <span className="post-reply-count">{post.replyCount}</span>
            </button>

            {onOpenMenu && (
              <div className="post-more-wrapper">
                <button
                  type="button"
                  className="post-more-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenMenu(post.id);
                  }}
                >
                  ⋯
                </button>

                {menuOpen && (
                  <div className="post-more-menu">
                    <button
                      type="button"
                      className="post-report-btn"
                      disabled={!viewerReady}
                      onClick={(e) => {
                        e.stopPropagation();
                        onReport?.(post.id);
                      }}
                    >
                      通報する
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {!viewerReady && (
            <div className="feed-message" style={{ padding: "6px 0 0", fontSize: 11 }}>
              いいね・通報はログイン後に利用できます。
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