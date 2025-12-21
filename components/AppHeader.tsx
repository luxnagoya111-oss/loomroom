"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUserId, logout } from "@/lib/auth";
import { isGuestId } from "@/types/user";
import { supabase } from "@/lib/supabaseClient";

type AppHeaderProps = {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  rightSlot?: React.ReactNode;
  backAriaLabel?: string;
};

type DbUserRow = {
  id: string;
  role: "user" | "therapist" | "store" | null;
};

type DbStoreRow = { id: string };
type DbTherapistRow = { id: string };

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

  const go = (href: string) => {
    setMenuOpen(false);
    router.push(href);
  };

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

  /**
   * ★ BottomNav と完全に同じ「マイ」遷移
   * - guest -> /login
   * - store -> /store/{storeId}
   * - therapist -> /therapist/{therapistId}
   * - user -> /mypage/{userId}
   */
  const handleMyPageClick = async () => {
    const id = getCurrentUserId();

    setMenuOpen(false);

    if (!id || isGuestId(id)) {
      router.push("/login");
      return;
    }

    try {
      // users.role
      const { data: u, error: uErr } = await supabase
        .from("users")
        .select("id, role")
        .eq("id", id)
        .maybeSingle<DbUserRow>();

      if (uErr) {
        console.error("[AppHeader] users.role fetch error:", uErr);
        router.push(`/mypage/${encodeURIComponent(id)}`);
        return;
      }

      const role = u?.role ?? null;

      if (role === "store") {
        const { data: s, error: sErr } = await supabase
          .from("stores")
          .select("id")
          .eq("owner_user_id", id)
          .maybeSingle<DbStoreRow>();

        if (sErr) console.error("[AppHeader] stores fetch error:", sErr);

        if (s?.id) {
          router.push(`/store/${encodeURIComponent(s.id)}`);
          return;
        }

        router.push(`/mypage/${encodeURIComponent(id)}`);
        return;
      }

      if (role === "therapist") {
        const { data: t, error: tErr } = await supabase
          .from("therapists")
          .select("id")
          .eq("user_id", id)
          .maybeSingle<DbTherapistRow>();

        if (tErr) console.error("[AppHeader] therapists fetch error:", tErr);

        if (t?.id) {
          router.push(`/therapist/${encodeURIComponent(t.id)}`);
          return;
        }

        router.push(`/mypage/${encodeURIComponent(id)}`);
        return;
      }

      // user / null は /mypage
      router.push(`/mypage/${encodeURIComponent(id)}`);
    } catch (e) {
      console.error("[AppHeader] handleMyPageClick exception:", e);
      router.push(`/mypage/${encodeURIComponent(id)}`);
    }
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

        {/* 中央：タイトル */}
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
        <div className="menu-drawer-overlay" onClick={() => setMenuOpen(false)}>
          <div className="menu-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title">メニュー</div>
              <button
                type="button"
                className="drawer-close"
                onClick={() => setMenuOpen(false)}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>

            <nav className="drawer-nav">
              {/* 基本ナビ */}
              <button
                type="button"
                className="drawer-item drawer-item-button"
                onClick={() => go("/")}
              >
                ホーム
              </button>

              <button
                type="button"
                className="drawer-item drawer-item-button"
                onClick={() => go("/search")}
              >
                さがす
              </button>

              {/* ★ BottomNav と同じ遷移 */}
              <button
                type="button"
                className="drawer-item drawer-item-button"
                onClick={handleMyPageClick}
              >
                マイ
              </button>

              <button
                type="button"
                className="drawer-item drawer-item-button"
                onClick={() => go("/contact")}
              >
                お問い合わせ
              </button>

              {/* 会員 / アカウント */}
              <div className="drawer-section-label">会員 / アカウント</div>

              <button
                type="button"
                className="drawer-item drawer-item-button"
                onClick={() => go("/login")}
              >
                ログイン / 新規登録
              </button>

              {loggedIn && (
                <button
                  type="button"
                  className="drawer-item drawer-item-button"
                  onClick={handleLogoutClick}
                >
                  ログアウト
                </button>
              )}

              <button
                type="button"
                className="drawer-item drawer-item-button"
                onClick={() => go("/signup/creator/start?kind=store")}
              >
                会員登録（店舗）
              </button>

              <button
                type="button"
                className="drawer-item drawer-item-button"
                onClick={() => go("/signup/creator/start?kind=therapist")}
              >
                会員登録（セラピスト）
              </button>

              {/* ポリシー・ガイドライン */}
              <div className="drawer-section-label">ルール / ポリシー</div>

              <button
                type="button"
                className="drawer-item drawer-item-button"
                onClick={() => go("/terms")}
              >
                利用規約
              </button>

              <button
                type="button"
                className="drawer-item drawer-item-button"
                onClick={() => go("/privacy")}
              >
                プライバシーポリシー
              </button>

              <button
                type="button"
                className="drawer-item drawer-item-button"
                onClick={() => go("/guideline")}
              >
                ガイドライン
              </button>
            </nav>
          </div>
        </div>
      )}

      <style jsx>{`
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
          cursor: pointer;
        }

        .header-icon-spacer {
          width: 34px;
          height: 34px;
        }

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