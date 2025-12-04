"use client";

import React, { useState } from "react";

// ★ ここに置く（import の下 / コンポーネントの上）
const CURRENT_USER_ID = "guest"; 

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
  authorId: string;
  authorName: string;
  authorKind: AuthorKind;
  area: Area;
  body: string;
  timeAgo: string;
  likeCount: number;
  liked: boolean;
  replyCount: number;
};

const DEMO_POSTS: Post[] = [
  {
    id: "p1",
    authorId: "taki",
    authorName: "TAKI",
    authorKind: "therapist",
    area: "中部",
    body: "少し寒い日が続くね。今日はゆっくり過ごしたい人多いはず。",
    timeAgo: "1時間前",
    likeCount: 23,
    liked: false,
    replyCount: 4,
  },
  {
    id: "p2",
    authorId: "loomroom_nagoya",
    authorName: "LoomRoom nagoya",
    authorKind: "store",
    area: "中部",
    body: "アプリの開発が少しずつ進んでいます。世界観を大切に。",
    timeAgo: "3時間前",
    likeCount: 12,
    liked: false,
    replyCount: 2,
  },
  {
    id: "p3",
    authorId: "u22",
    authorName: "ゆっくりさん",
    authorKind: "user",
    area: "関東",
    body: "初めて利用してみたけど、想像してたより落ち着いた時間でした。",
    timeAgo: "昨日",
    likeCount: 31,
    liked: false,
    replyCount: 5,
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
  if (post.authorKind === "therapist" && post.authorId === "taki") {
    return "@taki_lux";
  }
  if (post.authorKind === "store") {
    return "@loomroom_nagoya";
  }
  if (post.authorKind === "user") {
    return `@user_${post.authorId}`;
  }
  return null;
};

// プロフィール遷移（デモ）
const goToProfile = (authorKind: AuthorKind, authorId: string) => {
  if (authorKind === "therapist") {
    window.location.href = `/therapist/${authorId}`;
  } else if (authorKind === "store") {
    window.location.href = `/store/${authorId}`;
  }
  // user は遷移なし
};

// 未読はデモで true に固定
const hasUnread = true;

export default function LoomRoomHome() {
  const [posts, setPosts] = useState<Post[]>(DEMO_POSTS);

  // いいね ON/OFF
  const handleToggleLike = (id: string) => {
    setPosts((prev) =>
      prev.map((post) =>
        post.id === id
          ? {
              ...post,
              liked: !post.liked,
              likeCount: post.likeCount + (!post.liked ? 1 : -1),
            }
          : post
      )
    );
  };

  return (
    <div className="app-shell">
      {/* ヘッダー */}
      <header className="app-header">
        <div className="app-header-left">
          <div className="logo-circle" />
          <div className="app-title">ホーム</div>
        </div>
        <button
          type="button"
          className="header-icon-btn"
          onClick={() => (window.location.href = "/search")}
        >
          🔍
        </button>
      </header>

      {/* メイン：BOXなし・区切り線リスト */}
      <main className="app-main">
        <section className="feed-list">
          {posts.map((post) => {
            const handle = getHandle(post);
            const clickable = post.authorKind !== "user";

            return (
              <article
                key={post.id}
                className="feed-item"
                onClick={() =>
                  clickable && goToProfile(post.authorKind, post.authorId)
                }
                style={{ cursor: clickable ? "pointer" : "default" }}
              >
                <div className="feed-item-inner">
                  {/* 左：アイコン */}
                  <div className="avatar">
                    {post.authorKind === "therapist"
                      ? "🧑‍🦱"
                      : post.authorKind === "store"
                      ? "🏬"
                      : "🙂"}
                  </div>

                  {/* 右：本文 */}
                  <div className="feed-main">
                    <div className="feed-header">
                      <div className="feed-name-row">
                        <span className="post-name">{post.authorName}</span>
                        {renderGoldBadge(post.authorKind)}
                      </div>
                      {handle && <div className="post-username">{handle}</div>}
                      <div className="post-meta">
                        <span>{post.area}</span>
                        <span>{post.timeAgo}</span>
                      </div>
                    </div>

                    <div className="post-body">{post.body}</div>

                    <div className="post-actions">
                      {/* いいねボタン（カードクリックされないように stopPropagation） */}
                      <button
                        type="button"
                        className={
                          "post-like-btn" +
                          (post.liked ? " post-like-btn--liked" : "")
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleLike(post.id);
                        }}
                      >
                        <span className="post-like-icon">
                          {post.liked ? "♥" : "♡"}
                        </span>
                        <span className="post-like-count">
                          {post.likeCount}
                        </span>
                      </button>

                      <span
                        className="post-action-text"
                        onClick={(e) => e.stopPropagation()}
                      >
                        💬 {post.replyCount}
                      </span>
                      <span
                        className="post-action-text"
                        onClick={(e) => e.stopPropagation()}
                      >
                        🔖 保存
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </main>

      {/* 下ナビ */}
      <nav className="bottom-nav">
        <button
          type="button"
          className="nav-item is-active"
          onClick={() => (window.location.href = "/")}
        >
          <span className="nav-icon">🏠</span>
          ホーム
        </button>

        <button
          type="button"
          className="nav-item"
          onClick={() => (window.location.href = "/search")}
        >
          <span className="nav-icon">🔍</span>
          さがす
        </button>

        <button
          type="button"
          className="nav-item"
          onClick={() => (window.location.href = "/compose")}
        >
          <span className="nav-icon">➕</span>
          投稿
        </button>

        <button
          type="button"
          className="nav-item"
          onClick={() => (window.location.href = "/messages")}
        >
          <span className="nav-icon">💌</span>
          メッセージ
        </button>

        <button
          type="button"
          className="nav-item"
          onClick={() => (window.location.href = "/notifications")}
        >
          <span className="nav-icon-wrap">
            <span className="nav-icon">🔔</span>
            {hasUnread && <span className="nav-badge-dot" />}
          </span>
          通知
        </button>

        <button
          type="button"
          className="nav-item"
          onClick={() =>
            (window.location.href = `/mypage/${CURRENT_USER_ID}/console`)
          }
        >
          <span className="nav-icon">👤</span>
          マイ
        </button>
      </nav>
    </div>
  );
}