"use client";

import React, { useState, ChangeEvent } from "react";

// ★ ここに置く（import の下 / コンポーネントの上）
const CURRENT_USER_ID = "guest"; 

// ★ まずは強制的に true（確認用）
const hasUnread = true;

const ComposePage: React.FC = () => {
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState<"public" | "follow">("public");

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };

  const handlePost = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      alert("投稿内容を入力してください。");
      return;
    }

    // 本番ではここでAPI呼び出しなど
    alert(
      `（デモ）投稿を送信しました。\n\n本文：${trimmed}\n公開範囲：${
        visibility === "public" ? "すべて" : "フォロー中のみ"
      }`
    );
    setText("");
  };

  const handleCancel = () => {
    if (text.trim().length === 0) {
      history.back();
      return;
    }
    const ok = confirm("入力中の内容を破棄してよろしいですか？");
    if (ok) {
      setText("");
      history.back();
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
            <div className="app-title">投稿を作成</div>
          </div>

          <div style={{ width: 30 }} />
        </header>

        {/* メイン */}
        <main className="app-main compose-main">
          {/* プロフィール行 */}
          <section className="compose-profile-row">
            <div className="avatar">U</div>
            <div className="compose-profile-text">
              <div className="compose-name">あなた</div>
              <div className="compose-hint">今の気持ちをすこしだけ。</div>
            </div>
          </section>

          {/* テキスト入力 */}
          <section className="compose-text-section">
            <textarea
              className="compose-textarea"
              placeholder={
                "今日はどんな時間でしたか？\n不安なことも、嬉しかったことも、そのままで。"
              }
              value={text}
              onChange={handleChange}
            />
          </section>

          {/* オプション行 */}
          <section className="compose-options">
            <div className="compose-option-block">
              <div className="compose-option-label">公開範囲</div>
              <div className="pill-toggle">
                <button
                  type="button"
                  className={
                    "pill-toggle-item" +
                    (visibility === "public" ? " is-active" : "")
                  }
                  onClick={() => setVisibility("public")}
                >
                  すべて
                </button>
                <button
                  type="button"
                  className={
                    "pill-toggle-item" +
                    (visibility === "follow" ? " is-active" : "")
                  }
                  onClick={() => setVisibility("follow")}
                >
                  フォロー中のみ
                </button>
              </div>
            </div>

            <div className="compose-option-block">
              <div className="compose-option-label">メディア</div>
              <button
                type="button"
                className="chip chip-outline"
                onClick={() =>
                  alert("（デモ）メディア選択はまだ未実装です。")
                }
              >
                📷 画像・動画を追加
              </button>
            </div>
          </section>
        </main>

        {/* 下フッターボタン */}
        <footer className="compose-footer-bar">
          <button
            type="button"
            className="compose-footer-btn compose-footer-btn--ghost"
            onClick={handleCancel}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="compose-footer-btn compose-footer-btn--primary"
            onClick={handlePost}
          >
            投稿する
          </button>
        </footer>

        {/* 下ナビ：投稿をアクティブ */}
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
            className="nav-item is-active"
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

      {/* このページ専用のスタイルだけ scoped で持つ */}
      <style jsx>{`
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

        .compose-main {
          padding: 12px 16px 120px;
        }

        .avatar {
          width: 38px;
          height: 38px;
          border-radius: 999px;
          background: #ddd;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }

        .compose-profile-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }

        .compose-profile-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .compose-name {
          font-size: 14px;
          font-weight: 600;
        }

        .compose-hint {
          font-size: 12px;
          color: var(--text-sub);
        }

        .compose-text-section {
          margin-top: 6px;
          margin-bottom: 14px;
        }

        .compose-textarea {
          width: 100%;
          min-height: 160px;
          border-radius: 14px;
          border: 1px solid var(--border);
          padding: 10px 12px;
          font-size: 14px;
          line-height: 1.7;
          resize: vertical;
          background: var(--surface);
        }

        .compose-textarea::placeholder {
          color: #b6b7bd;
        }

        .compose-options {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .compose-option-block {
          background: var(--surface);
          border-radius: 12px;
          border: 1px solid var(--border);
          padding: 10px 12px;
        }

        .compose-option-label {
          font-size: 12px;
          color: var(--text-sub);
          margin-bottom: 6px;
        }

        .pill-toggle {
          display: inline-flex;
          border-radius: 999px;
          background: var(--surface-soft);
          border: 1px solid var(--border);
          padding: 2px;
          gap: 2px;
        }

        .pill-toggle-item {
          border-radius: 999px;
          border: none;
          background: transparent;
          padding: 4px 10px;
          font-size: 12px;
          color: var(--text-sub);
          cursor: pointer;
        }

        .pill-toggle-item.is-active {
          background: var(--accent-soft);
          color: var(--accent);
          font-weight: 600;
        }

        .chip {
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 12px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .chip-outline {
          border: 1px solid var(--border);
          background: var(--surface-soft);
          color: var(--text-sub);
        }

        .compose-footer-bar {
          position: fixed;
          bottom: 58px;
          left: 0;
          width: 100vw;
          max-width: 100vw;
          padding: 8px 16px;
          background: linear-gradient(
            to top,
            rgba(247, 247, 250, 0.98),
            rgba(247, 247, 250, 0.88)
          );
          border-top: 1px solid var(--border);
          display: flex;
          gap: 8px;
          z-index: 25;
        }

        .compose-footer-btn {
          flex: 1;
          border-radius: 999px;
          padding: 9px 12px;
          font-size: 14px;
          font-weight: 600;
          border: none;
          cursor: pointer;
        }

        .compose-footer-btn--ghost {
          background: transparent;
          color: var(--text-sub);
          border: 1px solid var(--border);
        }

        .compose-footer-btn--primary {
          background: var(--accent);
          color: #fff;
          box-shadow: 0 2px 6px rgba(215, 185, 118, 0.45);
        }
      `}</style>
    </>
  );
};

export default ComposePage;