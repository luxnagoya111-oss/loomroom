"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { UserId } from "@/types/user";
import { inferRoleFromId, isGuestId } from "@/types/user";
import { getCurrentUserId } from "@/lib/auth";

type NavKey =
  | "home"
  | "search"
  | "compose"
  | "messages"
  | "notifications"
  | "mypage";

type BottomNavProps = {
  /** どのタブをアクティブ表示にするか（省略時はURLから自動判定） */
  active?: NavKey;
  /** 未読通知があるかどうか（省略時は false） */
  hasUnread?: boolean;
};

function inferActiveFromPath(pathname: string | null): NavKey {
  if (!pathname) return "home";
  const path = pathname;

  if (path === "/") return "home";
  if (path.startsWith("/search")) return "search";
  if (path.startsWith("/compose")) return "compose";
  if (path.startsWith("/messages")) return "messages";
  if (path.startsWith("/notifications")) return "notifications";
  if (path.startsWith("/mypage")) return "mypage";

  return "home";
}

const BottomNav: React.FC<BottomNavProps> = ({ active, hasUnread = false }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUserId, setCurrentUserId] = useState<UserId>("guest");
  const [isGuest, setIsGuest] = useState<boolean>(true);

  useEffect(() => {
    // クライアント側で ID を確定させる
    const id = getCurrentUserId();
    setCurrentUserId(id);
    setIsGuest(isGuestId(id));
  }, []);

  const resolvedActive: NavKey =
    active ?? inferActiveFromPath(pathname ?? null);

  const go = (href: string) => {
    router.push(href);
  };

  const handleMessagesClick = () => {
    if (isGuest) {
      // 未ログイン → ログイン画面へ
      go("/login");
      return;
    }
    // ログイン済み → メッセージ一覧へ
    go("/messages");
  };

  const handleNotificationsClick = () => {
    if (isGuest) {
      // 未ログイン → ログイン画面へ
      go("/login");
      return;
    }
    // ログイン済み → 通知ページへ
    go("/notifications");
  };

  const handleMypageClick = () => {
    const id = currentUserId;
    const role = inferRoleFromId(id);

    if (isGuestId(id)) {
      // 未ログイン → /login へ
      go("/login");
      return;
    }

    if (role === "therapist" || role === "store") {
      // セラピスト／店舗アカウント → 従来どおり Console へ
      go(`/mypage/${id}/console`);
      return;
    }

    // 一般ユーザー（UUIDなど）は /mypage/[id] へ
    go(`/mypage/${id}`);
  };

  return (
    <>
      <nav className="bottom-nav">
        <button
          type="button"
          className={
            "nav-item" + (resolvedActive === "home" ? " is-active" : "")
          }
          onClick={() => go("/")}
        >
          <span className="nav-icon">🏠</span>
          ホーム
        </button>

        <button
          type="button"
          className={
            "nav-item" + (resolvedActive === "search" ? " is-active" : "")
          }
          onClick={() => go("/search")}
        >
          <span className="nav-icon">🔍</span>
          さがす
        </button>

        <button
          type="button"
          className={
            "nav-item" + (resolvedActive === "compose" ? " is-active" : "")
          }
          onClick={() => go("/compose")}
        >
          <span className="nav-icon nav-icon-compose">＋</span>
        </button>

        <button
          type="button"
          className={
            "nav-item" + (resolvedActive === "messages" ? " is-active" : "")
          }
          onClick={handleMessagesClick}
        >
          <span className="nav-icon">✉</span>
          メッセージ
        </button>

        <button
          type="button"
          className={
            "nav-item" +
            (resolvedActive === "notifications" ? " is-active" : "")
          }
          onClick={handleNotificationsClick}
        >
          <span className="nav-icon-wrap">
            <span className="nav-icon">🔔</span>
            {hasUnread && <span className="nav-badge-dot" />}
          </span>
          通知
        </button>

        <button
          type="button"
          className={
            "nav-item" + (resolvedActive === "mypage" ? " is-active" : "")
          }
          onClick={handleMypageClick}
        >
          <span className="nav-icon">👤</span>
          マイ
        </button>
      </nav>

      <style jsx>{`
        .bottom-nav {
          position: fixed;
          left: 50%;
          bottom: 0;
          transform: translateX(-50%);
          width: 100%;
          max-width: 480px;
          height: 60px;
          background: rgba(253, 251, 247, 0.96);
          border-top: 1px solid var(--border);
          display: flex;
          justify-content: space-around;
          align-items: center;
          padding: 4px 8px;
          z-index: 30;
          backdrop-filter: blur(10px);
        }

        .nav-item {
          flex: 1;
          height: 52px;
          border: none;
          background: transparent;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          color: #666;
          cursor: pointer;
          border-radius: 999px;
          transition: background 0.15s ease, color 0.15s ease,
            transform 0.1s ease;
        }

        .nav-item.is-active {
          background: rgba(250, 236, 214, 0.9);
          color: #8b5c20;
          font-weight: 600;
        }

        .nav-icon {
          font-size: 18px;
          line-height: 1;
          margin-bottom: 2px;
        }

        .nav-icon-compose {
          font-size: 22px;
          font-weight: 700;
        }

        .nav-icon-wrap {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .nav-badge-dot {
          position: absolute;
          right: -2px;
          top: -2px;
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #f97316; /* オレンジ系 */
          border: 1px solid #fff;
        }
      `}</style>
    </>
  );
};

export default BottomNav;