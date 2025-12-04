"use client";

import React from "react";

// ★ ここに置く（import の下 / コンポーネントの上）
const CURRENT_USER_ID = "guest"; 

// デモ通知（あとでAPI接続する前提）
const demoNotifs = [
  {
    id: "n1",
    type: "post" as const,
    icon: "✦",
    title: "フォロー中のセラピストが投稿しました",
    body: "TAKIさんが新しい投稿をしました。",
    time: "3分前",
    read: false,
  },
  {
    id: "n2",
    type: "dm" as const,
    icon: "💬",
    title: "新しいメッセージがあります",
    body: "セラピストから返信が届きました。",
    time: "1時間前",
    read: false,
  },
  {
    id: "n3",
    type: "system" as const,
    icon: "🏛",
    title: "LoomRoomからのお知らせ",
    body: "アプリのアップデート情報があります。",
    time: "昨日",
    read: true,
  },
];

export default function NotificationsPage() {
  // 未読が1件でもあれば true
  const hasUnread = demoNotifs.some((n) => !n.read);

  return (
    <>
      <div className="app-shell">
        {/* ヘッダー */}
        <header className="app-header">
          <div style={{ width: 30 }} />
          <div className="app-header-center">
            <div className="app-title">通知</div>
          </div>
          <div style={{ width: 30 }} />
        </header>

        {/* メイン */}
        <main className="app-main">
          <div className="notif-list">
            {demoNotifs.map((n) => (
              <div key={n.id} className="notif-card">
                <div className="notif-icon">{n.icon}</div>
                <div className="notif-main">
                  <div className="notif-title">{n.title}</div>
                  <div className="notif-body">{n.body}</div>
                  <div className="notif-time">{n.time}</div>
                </div>
              </div>
            ))}
          </div>
        </main>

        {/* 下ナビ：通知をアクティブ */}
        <nav className="bottom-nav">
          <button
            type="button"
            className="nav-item"
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
            className="nav-item is-active"
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

      {/* このページ専用の見た目だけローカルに持つ */}
      <style jsx>{`
        .app-main {
          padding: 12px 0 120px;
        }

        /* ====== 通知カードまわり ====== */
        .notif-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 0 16px 16px;
        }

        .notif-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 12px;
          display: flex;
          gap: 12px;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
        }

        .notif-icon {
          width: 40px;
          height: 40px;
          background: var(--accent-soft);
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          color: var(--accent);
        }

        .notif-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .notif-title {
          font-size: 14px;
          font-weight: 600;
        }

        .notif-body {
          font-size: 12px;
          color: var(--text-sub);
        }

        .notif-time {
          font-size: 11px;
          color: var(--text-sub);
          margin-top: 2px;
        }
      `}</style>
    </>
  );
}