"use client";

import React from "react";

// ★ ここに置く（import の下 / コンポーネントの上）
const CURRENT_USER_ID = "guest"; 

type Thread = {
  id: string;
  name: string;
  handle: string;
  lastMessage: string;
  time: string;
  unreadCount: number;
  kind: "therapist" | "store" | "user";
};

const hasUnread = true;

// デモ用スレッド
const demoThreads: Thread[] = [
  {
    id: "taki",
    name: "TAKI",
    handle: "@taki_lux",
    lastMessage: "今日はゆっくり眠れそうかな？",
    time: "3分前",
    unreadCount: 2,
    kind: "therapist",
  },
  {
    id: "loomroom",
    name: "LoomRoom nagoya",
    handle: "@loomroom",
    lastMessage: "アプリのアップデートのお知らせです。",
    time: "1時間前",
    unreadCount: 0,
    kind: "store",
  },
  {
    id: "yukkuri",
    name: "ゆっくりさん",
    handle: "@yukkuri",
    lastMessage: "きょうのお礼を伝えたくて...",
    time: "昨日",
    unreadCount: 0,
    kind: "user",
  },
];

const MessagesPage: React.FC = () => {
  const handleOpenThread = (threadId: string) => {
    // 本番では /messages/[id] などへ遷移予定
    window.location.href = `/messages/${threadId}`;
  };

  return (
    <>
      <div className="app-shell">
        {/* ヘッダー */}
        <header className="app-header">
          <div style={{ width: 30 }} />
          <div className="app-header-center">
            <div className="app-title">メッセージ</div>
          </div>
          <div style={{ width: 30 }} />
        </header>

        {/* メイン */}
        <main className="app-main messages-main">
          <section className="messages-section">
            <p className="messages-hint">
              セラピスト・店舗・ユーザーとのやり取りがここに並びます。
              <br />
              気になる名前をタップすると、チャット画面がひらきます。
            </p>
          </section>

          <section className="messages-section">
            <div className="thread-list">
              {demoThreads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={
                    "thread-item" + (t.unreadCount > 0 ? " thread-item--unread" : "")
                  }
                  onClick={() => handleOpenThread(t.id)}
                >
                  <div className="thread-avatar">
                    {t.kind === "therapist"
                      ? "🦋"
                      : t.kind === "store"
                      ? "🏛"
                      : "🙂"}
                  </div>
                  <div className="thread-main">
                    <div className="thread-name-row">
                      <div className="thread-name-block">
                        <span className="thread-name">{t.name}</span>
                        <span className="thread-handle">{t.handle}</span>
                      </div>
                      <div className="thread-meta-right">
                        <span className="thread-time">{t.time}</span>
                        {t.unreadCount > 0 && (
                          <span className="thread-unread-badge">
                            {t.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="thread-preview">
                      {t.unreadCount > 0 && <span className="thread-preview-dot" />}
                      <span className="thread-preview-text">{t.lastMessage}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </main>

        {/* 下ナビ：とりあえず「マイ」をアクティブ（自分のエリアという扱い） */}
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
            className="nav-item is-active"
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
            className="nav-item is-active"
            onClick={() => 
              (window.location.href = `/mypage/${CURRENT_USER_ID}/console`)
            }
          >
            <span className="nav-icon">👤</span>
            マイ
          </button>
        </nav>
      </div>

      <style jsx>{`
        .messages-main {
          padding: 12px 12px 120px;
        }

        .messages-section {
          margin-bottom: 10px;
        }

        .messages-hint {
          font-size: 12px;
          color: var(--text-sub);
          line-height: 1.6;
        }

        .thread-list {
          display: flex;
          flex-direction: column;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid var(--border);
          background: var(--surface);
        }

        /* iOS が勝手に青くする対策（リンク・タップハイライト完全無効） */
        .thread-list * {
          color: var(--text-main) !important;
          -webkit-tap-highlight-color: transparent !important;
          text-decoration: none !important;
        }

        .thread-item {
          width: 100%;
          border: none;
          background: transparent;
          padding: 10px 12px;
          display: flex;
          gap: 10px;
          cursor: pointer;
          text-align: left;
          border-bottom: 1px solid var(--border);
        }

        .thread-item:last-child {
          border-bottom: none;
        }

        .thread-item--unread {
          background: rgba(215, 185, 118, 0.06);
        }

        .thread-avatar {
          width: 40px;
          height: 40px;
          border-radius: 999px;
          background: var(--surface-soft);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
        }

        .thread-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .thread-name-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

       .thread-name-block {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        /* ここが iOS で青くなる主犯。
        aタグじゃなくても“タップ対象”と判定され青くされるので強制上書き。 */
        .thread-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-main) !important;
        }

        .thread-handle {
          font-size: 11px;
          color: var(--text-sub) !important;
        }

        .thread-meta-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
          margin-left: 8px;
        }

        .thread-time {
          font-size: 11px;
          color: var(--text-sub) !important;
        }

        .thread-unread-badge {
          min-width: 18px;
          padding: 2px 6px;
          border-radius: 999px;
          background: var(--accent);
          color: #fff;
          font-size: 11px;
          text-align: center;
        }

        .thread-preview {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--text-sub) !important;
          margin-top: 2px;
        }

        .thread-preview-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: var(--accent);
        }

        .thread-preview-text {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
         flex: 1;
        }
      `}</style>
    </>
  );
};

export default MessagesPage;