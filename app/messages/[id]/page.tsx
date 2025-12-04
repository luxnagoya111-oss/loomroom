"use client";

import React, { useState, ChangeEvent, KeyboardEvent } from "react";
import { useParams } from "next/navigation";

// ★ ここに置く（import の下 / コンポーネントの上）
const CURRENT_USER_ID = "guest"; 

type Message = {
  id: string;
  from: "me" | "partner";
  text: string;
  time: string;
};

const hasUnread = true;

// デモ用の会話
const demoMessages: Message[] = [
  {
    id: "m1",
    from: "partner",
    text: "今日はどうでしたか？少しでも気持ちが軽くなっていたら嬉しいです。",
    time: "19:12",
  },
  {
    id: "m2",
    from: "me",
    text: "帰り道、なんだか呼吸がしやすくなった感じがしました。",
    time: "19:20",
  },
  {
    id: "m3",
    from: "partner",
    text: "よかった…またゆっくり過ごしたくなったら、いつでもメッセージくださいね。",
    time: "19:24",
  },
];

const MessageDetailPage: React.FC = () => {
  const params = useParams<{ id: string }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const id = rawId || "user";

  const partnerName = id === "taki" ? "TAKI" : "メッセージ相手";
  const partnerHandle = id === "taki" ? "@taki_lux" : `@${id}`;

  const [text, setText] = useState("");
  const [messages] = useState<Message[]>(demoMessages);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // 本番ではここで API 送信＋メッセージ配列更新
    alert(`（デモ）メッセージを送信しました。\n\n本文：${trimmed}`);
    setText("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <div className="app-shell">
        {/* ヘッダー */}
        <header className="app-header">
          <button
            type="button"
            className="header-icon-btn"
            onClick={() => history.back()}
          >
            ◀
          </button>

          <div className="app-header-center">
            <div className="app-title">{partnerName}</div>
            <div className="app-header-sub">{partnerHandle}</div>
          </div>

          <div style={{ width: 30 }} />
        </header>

        {/* メイン（チャット） */}
        <main className="app-main chat-main">
          <div className="chat-inner">
            {messages.map((m) => (
              <div
                key={m.id}
                className={
                  "chat-row " +
                  (m.from === "me" ? "chat-row--me" : "chat-row--partner")
                }
              >
                {m.from === "partner" && (
                  <div className="chat-avatar chat-avatar--partner">🦋</div>
                )}
                <div className="chat-bubble-wrap">
                  <div className="chat-bubble">{m.text}</div>
                  <div className="chat-meta">{m.time}</div>
                </div>
                {m.from === "me" && (
                  <div className="chat-avatar chat-avatar--me">U</div>
                )}
              </div>
            ))}
          </div>
        </main>

        {/* 入力バー */}
        <footer className="chat-input-bar">
          <div className="chat-input-inner">
            <textarea
              className="chat-textarea"
              placeholder="メッセージを入力…"
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              className="chat-send-btn"
              onClick={handleSend}
            >
              送信
            </button>
          </div>
        </footer>

        {/* 下ナビ：このページでは 💌（メッセージ）をアクティブに */}
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

      <style jsx global>{`
        :root {
          --bg: #f7f7fa;
          --surface: #ffffff;
          --surface-soft: #f3f4f6;
          --border: #e4e6eb;
          --accent: #d7b976;
          --accent-soft: rgba(215, 185, 118, 0.18);
          --text-main: #2c2c30;
          --text-sub: #7d8088;
        }

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          background: var(--bg);
          font-family: -apple-system, BlinkMacSystemFont, "Noto Sans JP",
            sans-serif;
          display: flex;
          justify-content: center;
          align-items: stretch;
          min-height: 100vh;
          color: var(--text-main);
        }

        .app-shell {
          width: 100%;
          max-width: 430px;
          min-height: 100vh;
          background: var(--bg);
          border-left: 1px solid var(--border);
          border-right: 1px solid var(--border);
          box-shadow: 0 0 20px rgba(0, 0, 0, 0.07);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
          padding-bottom: 58px;
        }

        .app-header {
          height: 56px;
          background: var(--surface);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          border-bottom: 1px solid var(--border);
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .app-header-center {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }

        .app-title {
          font-size: 16px;
          font-weight: 600;
        }

        .app-header-sub {
          font-size: 12px;
          color: var(--text-sub);
        }

        .header-icon-btn {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          color: var(--text-sub);
          background: var(--surface-soft);
          cursor: pointer;
        }

        .app-main {
          flex: 1;
          overflow-y: auto;
          padding: 10px 10px 120px;
        }

        .chat-main {
          background: linear-gradient(
            180deg,
            #f7f7fa 0%,
            #f8f3e5 40%,
            #f7f7fa 100%
          );
        }

        .chat-inner {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .chat-row {
          display: flex;
          align-items: flex-end;
          gap: 6px;
        }

        .chat-row--partner {
          justify-content: flex-start;
        }

        .chat-row--me {
          justify-content: flex-end;
        }

        .chat-avatar {
          width: 32px;
          height: 32px;
          border-radius: 999px;
          background: var(--surface);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
        }

        .chat-avatar--partner {
          order: 1;
        }

        .chat-avatar--me {
          order: 3;
        }

        .chat-bubble-wrap {
          max-width: 75%;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .chat-bubble {
          border-radius: 18px;
          padding: 8px 11px;
          font-size: 14px;
          line-height: 1.6;
          word-break: break-word;
        }

        .chat-row--partner .chat-bubble {
          background: var(--surface);
          color: var(--text-main);
          border: 1px solid var(--border);
        }

        .chat-row--me .chat-bubble {
          background: var(--accent);
          color: #fff;
        }

        .chat-meta {
          font-size: 11px;
          color: var(--text-sub);
        }

        .chat-row--partner .chat-meta {
          text-align: left;
        }

        .chat-row--me .chat-meta {
          text-align: right;
        }

        .chat-input-bar {
          position: fixed;
          bottom: 58px;
          left: 50%;
          transform: translateX(-50%);
          width: 100%;
          max-width: 430px;
          padding: 8px 10px;
          background: linear-gradient(
            to top,
            rgba(247, 247, 250, 0.98),
            rgba(247, 247, 250, 0.88)
          );
          border-top: 1px solid var(--border);
          z-index: 25;
        }

        .chat-input-inner {
          display: flex;
          align-items: center; /* ← LINEっぽく中央寄せ */
          gap: 8px;
          background: var(--surface);
          border-radius: 999px;
          border: 1px solid var(--border);
          padding: 6px 8px 6px 12px;
        }

        .chat-textarea {
          flex: 1;
          border: none;
          outline: none;
          resize: none;
          font-size: 13px;
          line-height: 1.4;
          padding: 4px 0;   /* ← パディングを極小にする */
          height: 22px;     /* ← これで1行確定 */
          min-height: 25px; /* ← 1行ぶんくらいに低め */
          max-height: 80px;

          background: transparent;
        }

        .chat-textarea::placeholder {
          color: #b6b7bd;
        }

        .chat-send-btn {
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 13px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          background: var(--accent);
          color: #fff;
          box-shadow: 0 2px 6px rgba(215, 185, 118, 0.45);
          flex-shrink: 0;
        }

        .app-main::-webkit-scrollbar {
          width: 4px;
        }

        .app-main::-webkit-scrollbar-thumb {
          background: #d4d4de;
          border-radius: 999px;
        }

        .bottom-nav {
          position: fixed;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 100%;
          max-width: 430px;
          height: 58px;
          background: var(--surface);
          border-top: 1px solid var(--border);
          display: flex;
          justify-content: space-around;
          align-items: center;
          box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.03);
          z-index: 20;
        }

        .nav-item {
          flex: 1;
          text-align: center;
          font-size: 12px;
          color: var(--text-sub);
          cursor: pointer;
          user-select: none;
          border: none;
          background: transparent;
          padding: 4px 0;
        }

        .nav-item.is-active {
          color: var(--accent);
          font-weight: 600;
        }

        .nav-icon {
          font-size: 20px;
          display: block;
        }

        /* バッジ用 */
        .nav-icon-wrap {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .nav-badge-dot {
          position: absolute;
          top: -2px;
          right: -2px;
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: #ff9f43;
          border: 2px solid var(--surface);
        }
      `}</style>
    </>
  );
};

export default MessageDetailPage;