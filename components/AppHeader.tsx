"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUserId, logout } from "@/lib/auth";
import { isGuestId } from "@/types/user";

type AppHeaderProps = {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  rightSlot?: React.ReactNode;
  backAriaLabel?: string;
};

const AppHeader: React.FC<AppHeaderProps> = ({
  title = "LRoom",
  subtitle,
  showBack = true,
  rightSlot,
  backAriaLabel = "戻る",
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined") window.history.back();
  };

  // マウント時に「ログイン済みかどうか」をざっくり判定
  useEffect(() => {
    const id = getCurrentUserId();
    setLoggedIn(!isGuestId(id));
  }, []);

  const handleLogoutClick = async () => {
    await logout(); // supabase.signOut + localStorageクリア
    setLoggedIn(false);
    setMenuOpen(false);
    router.push("/");
  };

  // ★ 修正：マイページ遷移（/mypage/[id] へ）
  const handleMyPageClick = () => {
    const id = getCurrentUserId();

    setMenuOpen(false);

    // ゲストはログインへ（必要なら /signup/user でもOK）
    if (isGuestId(id)) {
      router.push("/login");
      return;
    }

    router.push(`/mypage/${encodeURIComponent(id)}`);
  };

  return (
    <>
      {/* ===== 上部ナビバー ===== */}
      <header className="app-header">
        {/* 左端：戻る */}
        {showBack ? (
          <button
            type="button"
            className="header-icon-btn header-back"
            onClick={handleBack}
            aria-label={backAriaLabel}
          >
            ←
          </button>
        ) : (
          <div className="header-icon-spacer header-back" />
        )}

        {/* 画面のど真ん中：タイトル（絶対配置で固定） */}
        <div className="header-center">
          <div className="app-title">{title}</div>
          {subtitle && <div className="app-header-sub">{subtitle}</div>}
        </div>

        {/* 右端：メニュー */}
        <div className="header-right">
          {rightSlot ? (
            rightSlot
          ) : (
            <button
              type="button"
              className="header-icon-btn"
              aria-label="メニュー"
              onClick={() => setMenuOpen(true)}
            >
              ≡
            </button>
          )}
        </div>
      </header>

      {/* ===== サイドメニュー ===== */}
      {menuOpen && (
        <div
          className="menu-drawer-overlay"
          onClick={() => setMenuOpen(false)}
        >
          <div className="menu-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title">メニュー</div>
              <button className="drawer-close" onClick={() => setMenuOpen(false)}>
                ×
              </button>
            </div>

            <nav className="drawer-nav">
              {/* 基本ナビ */}
              <a href="/" className="drawer-item" onClick={() => setMenuOpen(false)}>
                ホーム
              </a>
              <a
                href="/search"
                className="drawer-item"
                onClick={() => setMenuOpen(false)}
              >
                さがす
              </a>

              {/* ★ 修正：/mypage は存在しないので動的に飛ばす */}
              <button
                type="button"
                className="drawer-item drawer-item-button"
                onClick={handleMyPageClick}
              >
                マイページ
              </button>

              <a
                href="/contact"
                className="drawer-item"
                onClick={() => setMenuOpen(false)}
              >
                お問い合わせ
              </a>

              {/* 会員 / アカウント */}
              <div className="drawer-section-label">会員 / アカウント</div>
              <a
                href="/login"
                className="drawer-item"
                onClick={() => setMenuOpen(false)}
              >
                ログイン / 新規登録
              </a>

              {/* ログイン中のみ表示されるログアウトボタン */}
              {loggedIn && (
                <button
                  type="button"
                  className="drawer-item drawer-item-button"
                  onClick={handleLogoutClick}
                >
                  ログアウト
                </button>
              )}

              <a
                href="/signup/creator/start?kind=store"
                className="drawer-item"
                onClick={() => setMenuOpen(false)}
              >
                会員登録（店舗）
              </a>
              <a
                href="/signup/creator/start?kind=therapist"
                className="drawer-item"
                onClick={() => setMenuOpen(false)}
              >
                会員登録（セラピスト）
              </a>

              {/* ポリシー・ガイドライン */}
              <div className="drawer-section-label">ルール / ポリシー</div>
              <a
                href="/terms"
                className="drawer-item"
                onClick={() => setMenuOpen(false)}
              >
                利用規約
              </a>
              <a
                href="/privacy"
                className="drawer-item"
                onClick={() => setMenuOpen(false)}
              >
                プライバシーポリシー
              </a>
              <a
                href="/guideline"
                className="drawer-item"
                onClick={() => setMenuOpen(false)}
              >
                ガイドライン
              </a>
            </nav>
          </div>
        </div>
      )}

      <style jsx>{`
        /* ===== ナビバー本体 ===== */
        .app-header {
          position: sticky;
          top: 0;
          z-index: 30;
          width: 100%;
          height: 48px;
          background: rgba(253, 251, 247, 0.96);
          border-bottom: 1px solid var(--border);
          backdrop-filter: blur(10px);

          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 8px;
        }

        /* 左端ボタン（相対） */
        .header-back {
          position: relative;
          z-index: 2;
        }

        .header-right {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .header-icon-btn {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          color: var(--text-sub);
          background: var(--surface-soft);
        }

        .header-icon-spacer {
          width: 34px;
          height: 34px;
        }

        /* ★ タイトルは画面の“物理的な中央”に固定 ★ */
        .header-center {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          top: 0;
          height: 48px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          pointer-events: none;
        }

        .app-title {
          font-size: 15px;
          font-weight: 600;
          white-space: nowrap;
          max-width: 60vw;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .app-header-sub {
          font-size: 11px;
          color: var(--text-sub);
          white-space: nowrap;
          max-width: 60vw;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* ===== メニューの見た目 ===== */
        .menu-drawer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.25);
          z-index: 40;
          display: flex;
          justify-content: flex-end;
        }

        .menu-drawer {
          width: 72%;
          max-width: 280px;
          background: #fffdf8;
          height: 100%;
          padding: 16px;
          border-left: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          animation: slideIn 0.22s ease-out;
        }

        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }

        .drawer-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .drawer-title {
          font-size: 16px;
          font-weight: 600;
        }

        .drawer-close {
          font-size: 20px;
          background: none;
          border: none;
          cursor: pointer;
        }

        .drawer-nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .drawer-item {
          padding: 8px 4px;
          font-size: 14px;
          border-bottom: 1px solid var(--border-light);
          color: inherit;
          text-decoration: none;
          background: none;
        }

        /* button版 drawer-item（見た目は同じ） */
        .drawer-item-button {
          width: 100%;
          text-align: left;
          border: none;
          cursor: pointer;
        }

        .drawer-section-label {
          margin-top: 16px;
          padding: 4px 2px;
          font-size: 11px;
          color: var(--text-sub);
        }
      `}</style>
    </>
  );
};

export default AppHeader;