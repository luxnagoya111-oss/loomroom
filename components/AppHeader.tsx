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

type Role = "user" | "therapist" | "store";

type DbUserRow = {
  id: string;
  role: Role | null;
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

  // 表示制御用
  const [loggedIn, setLoggedIn] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [hasStoreProfile, setHasStoreProfile] = useState(false);
  const [hasTherapistProfile, setHasTherapistProfile] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState(false);

  const router = useRouter();

  const go = (href: string) => {
    setMenuOpen(false);
    router.push(href);
  };

  const handleBack = () => {
    if (typeof window !== "undefined") window.history.back();
  };

  // ログイン状態（guest判定）＋アカウント情報の取得
  useEffect(() => {
    let cancelled = false;

    const id = getCurrentUserId();
    const isLoggedIn = !!id && !isGuestId(id);

    setLoggedIn(isLoggedIn);

    // 未ログインなら表示制御をリセット
    if (!isLoggedIn) {
      setRole(null);
      setHasStoreProfile(false);
      setHasTherapistProfile(false);
      return;
    }

    (async () => {
      setLoadingAccount(true);
      try {
        // users.role
        const { data: u, error: uErr } = await supabase
          .from("users")
          .select("id, role")
          .eq("id", id)
          .maybeSingle<DbUserRow>();

        if (cancelled) return;

        if (uErr) {
          console.error("[AppHeader] users.role fetch error:", uErr);
          setRole(null);
        } else {
          setRole((u?.role ?? null) as Role | null);
        }

        // 実体プロフィール（roleズレ保険）
        const [storeRes, therapistRes] = await Promise.all([
          supabase
            .from("stores")
            .select("id")
            .eq("owner_user_id", id)
            .maybeSingle<DbStoreRow>(),
          supabase
            .from("therapists")
            .select("id")
            .eq("user_id", id)
            .maybeSingle<DbTherapistRow>(),
        ]);

        if (cancelled) return;

        if (storeRes.error) {
          console.error("[AppHeader] stores fetch error:", storeRes.error);
          setHasStoreProfile(false);
        } else {
          setHasStoreProfile(!!storeRes.data?.id);
        }

        if (therapistRes.error) {
          console.error("[AppHeader] therapists fetch error:", therapistRes.error);
          setHasTherapistProfile(false);
        } else {
          setHasTherapistProfile(!!therapistRes.data?.id);
        }
      } catch (e) {
        if (cancelled) return;
        console.error("[AppHeader] account bootstrap exception:", e);
        setRole(null);
        setHasStoreProfile(false);
        setHasTherapistProfile(false);
      } finally {
        if (cancelled) return;
        setLoadingAccount(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogoutClick = async () => {
    await logout();
    setLoggedIn(false);
    setRole(null);
    setHasStoreProfile(false);
    setHasTherapistProfile(false);
    setMenuOpen(false);
    router.push("/");
  };

  /**
   * ★ 体感改善版：
   * 1) まず /mypage/{id} に即遷移
   * 2) 裏で role を解決できたら /store or /therapist に replace
   */
  const handleMyPageClick = () => {
    const id = getCurrentUserId();
    setMenuOpen(false);

    if (!id || isGuestId(id)) {
      router.push("/login");
      return;
    }

    const fallback = `/mypage/${encodeURIComponent(id)}`;
    router.push(fallback);

    (async () => {
      try {
        const { data: u, error: uErr } = await supabase
          .from("users")
          .select("id, role")
          .eq("id", id)
          .maybeSingle<DbUserRow>();

        if (uErr) {
          console.error("[AppHeader] users.role fetch error:", uErr);
          return;
        }

        const r = (u?.role ?? null) as Role | null;

        if (r === "store") {
          const { data: s, error: sErr } = await supabase
            .from("stores")
            .select("id")
            .eq("owner_user_id", id)
            .maybeSingle<DbStoreRow>();

          if (sErr) console.error("[AppHeader] stores fetch error:", sErr);
          if (s?.id) router.replace(`/store/${encodeURIComponent(s.id)}`);
          return;
        }

        if (r === "therapist") {
          const { data: t, error: tErr } = await supabase
            .from("therapists")
            .select("id")
            .eq("user_id", id)
            .maybeSingle<DbTherapistRow>();

          if (tErr) console.error("[AppHeader] therapists fetch error:", tErr);
          if (t?.id) router.replace(`/therapist/${encodeURIComponent(t.id)}`);
          return;
        }
      } catch (e) {
        console.error("[AppHeader] handleMyPageClick exception:", e);
      }
    })();
  };

  // ===== 表示制御 =====
  // ログイン中はログイン導線を隠す
  const showLoginLink = !loggedIn;

  // 「兼ねない」前提なので、どちらか確定したら両方の登録導線を隠す
  // role が確定していなくても実体プロフィールがあれば隠す（ズレ保険）
  const isCreator =
    role === "store" ||
    role === "therapist" ||
    hasStoreProfile ||
    hasTherapistProfile;

  const showCreatorSignupLinks = !isCreator;

  return (
    <>
      <header className="app-header">
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

        <div className="header-center">
          <div className="app-title">{title}</div>
          {subtitle && <div className="app-header-sub">{subtitle}</div>}
        </div>

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

      {menuOpen && (
        <div
          className="menu-drawer-overlay"
          onClick={() => setMenuOpen(false)}
          role="presentation"
        >
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
                検索
              </button>

              <button
                type="button"
                className="drawer-item drawer-item-button"
                onClick={handleMyPageClick}
              >
                マイページ
              </button>

              <button
                type="button"
                className="drawer-item drawer-item-button"
                onClick={() => go("/contact")}
              >
                お問い合わせ
              </button>

              <div className="drawer-section-label">会員 / アカウント</div>

              {showLoginLink && (
                <button
                  type="button"
                  className="drawer-item drawer-item-button"
                  onClick={() => go("/login")}
                >
                  ログイン / 新規登録
                </button>
              )}

              {loggedIn && (
                <button
                  type="button"
                  className="drawer-item drawer-item-button"
                  onClick={handleLogoutClick}
                >
                  ログアウト
                </button>
              )}

              {showCreatorSignupLinks && (
                <>
                  <button
                    type="button"
                    className="drawer-item drawer-item-button"
                    onClick={() => go("/signup/creator/start?kind=store")}
                    disabled={loadingAccount}
                  >
                    店舗申請
                  </button>

                  <button
                    type="button"
                    className="drawer-item drawer-item-button"
                    onClick={() => go("/signup/creator/start?kind=therapist")}
                    disabled={loadingAccount}
                  >
                    セラピスト申請
                  </button>
                </>
              )}

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
          z-index: 50;
          width: 100%;
          height: 48px;
          background: rgba(253, 251, 247, 0.96);
          border-bottom: 1px solid var(--border);
          backdrop-filter: blur(10px);

          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 8px;

          pointer-events: auto;
          user-select: none;
          overscroll-behavior: contain;
        }

        button {
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
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
          z-index: 100;
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

        .drawer-item-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
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