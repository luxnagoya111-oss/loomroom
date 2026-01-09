"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { UserId } from "@/types/user";
import { isGuestId } from "@/types/user";
import { getCurrentUserId } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

type NavKey =
  | "home"
  | "search"
  | "compose"
  | "messages"
  | "notifications"
  | "mypage";

type BottomNavProps = {
  active?: NavKey;
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
  if (path.startsWith("/store")) return "mypage";
  if (path.startsWith("/therapist")) return "mypage";

  return "home";
}

type DbUserRow = {
  id: string;
  role: "user" | "therapist" | "store" | null;
};

type DbStoreRow = { id: string };
type DbTherapistRow = { id: string };

const BottomNav: React.FC<BottomNavProps> = ({ active, hasUnread = false }) => {
  const router = useRouter();
  const pathname = usePathname();

  const [currentUserId, setCurrentUserId] = useState<UserId>("guest");
  const [isGuest, setIsGuest] = useState<boolean>(true);

  const [hasUnreadLocal, setHasUnreadLocal] = useState<boolean>(hasUnread);

  const [dbRole, setDbRole] = useState<DbUserRow["role"]>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [therapistId, setTherapistId] = useState<string | null>(null);

  // 連打対策（短いガード）
  const [navBusy, setNavBusy] = useState(false);
  const navBusyTimer = useRef<number | null>(null);

  useEffect(() => {
    const id = getCurrentUserId();
    setCurrentUserId(id);
    setIsGuest(isGuestId(id));
  }, []);

  useEffect(() => {
    setHasUnreadLocal(hasUnread);
  }, [hasUnread]);

  useEffect(() => {
    const id = currentUserId;
    if (!id || isGuestId(id)) {
      setDbRole(null);
      setStoreId(null);
      setTherapistId(null);
      return;
    }

    let cancelled = false;

    const loadRoleAndOwner = async () => {
      try {
        const { data: u, error: uErr } = await supabase
          .from("users")
          .select("id, role")
          .eq("id", id)
          .maybeSingle<DbUserRow>();

        if (cancelled) return;

        if (uErr) {
          console.error("[BottomNav] users.role fetch error:", uErr);
          setDbRole(null);
          return;
        }

        setDbRole(u?.role ?? null);

        if (u?.role === "store") {
          const { data: s, error: sErr } = await supabase
            .from("stores")
            .select("id")
            .eq("owner_user_id", id)
            .maybeSingle<DbStoreRow>();

          if (!cancelled) {
            if (sErr) console.error("[BottomNav] stores fetch error:", sErr);
            setStoreId(s?.id ?? null);
            setTherapistId(null);
          }
        } else if (u?.role === "therapist") {
          const { data: t, error: tErr } = await supabase
            .from("therapists")
            .select("id")
            .eq("user_id", id)
            .maybeSingle<DbTherapistRow>();

          if (!cancelled) {
            if (tErr) console.error("[BottomNav] therapists fetch error:", tErr);
            setTherapistId(t?.id ?? null);
            setStoreId(null);
          }
        } else {
          setStoreId(null);
          setTherapistId(null);
        }
      } catch (e) {
        if (!cancelled) console.error("[BottomNav] loadRoleAndOwner exception:", e);
      }
    };

    loadRoleAndOwner();

    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  const resolvedActive: NavKey = active ?? inferActiveFromPath(pathname ?? null);

  const lockNavBriefly = () => {
    setNavBusy(true);
    if (navBusyTimer.current) window.clearTimeout(navBusyTimer.current);
    navBusyTimer.current = window.setTimeout(() => setNavBusy(false), 350);
  };

  const go = (href: string) => {
    if (navBusy) return;
    lockNavBriefly();
    router.push(href);
  };

  const handleMessagesClick = () => {
    if (isGuest) {
      go("/login");
      return;
    }
    go("/messages");
  };

  // ★ 重要：通知は「即遷移 → 裏で既読化」
  const handleNotificationsClick = () => {
    const id = currentUserId;

    if (!id || isGuestId(id)) {
      go("/login");
      return;
    }

    // 体感を最優先で即消す（押した瞬間に反映）
    setHasUnreadLocal(false);

    // 先に遷移
    go("/notifications");

    // 既読化は裏で（遷移をブロックしない）
    (async () => {
      try {
        const { error } = await supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("user_id", id)
          .eq("is_read", false);

        if (error) console.error("[BottomNav] mark notifications read error:", error);
      } catch (e) {
        console.error("[BottomNav] mark notifications read failed:", e);
      }
    })();
  };

  const handleMypageClick = () => {
    const id = currentUserId;

    if (!id || isGuestId(id)) {
      go("/login");
      return;
    }

    if (dbRole === "store") {
      if (storeId) go(`/store/${storeId}`);
      else go(`/mypage/${id}`);
      return;
    }

    if (dbRole === "therapist") {
      if (therapistId) go(`/therapist/${therapistId}`);
      else go(`/mypage/${id}`);
      return;
    }

    go(`/mypage/${id}`);
  };

  return (
    <>
      <nav className="bottom-nav" aria-busy={navBusy}>
        <button
          type="button"
          className={"nav-item" + (resolvedActive === "home" ? " is-active" : "")}
          onClick={() => go("/")}
          disabled={navBusy}
        >
          <span className="nav-icon">🏠</span>
          ホーム
        </button>

        <button
          type="button"
          className={"nav-item" + (resolvedActive === "search" ? " is-active" : "")}
          onClick={() => go("/search")}
          disabled={navBusy}
        >
          <span className="nav-icon">🔍</span>
          さがす
        </button>

        <button
          type="button"
          className={"nav-item" + (resolvedActive === "compose" ? " is-active" : "")}
          onClick={() => go("/compose")}
          disabled={navBusy}
        >
          <span className="nav-icon nav-icon-compose">＋</span>
        </button>

        <button
          type="button"
          className={"nav-item" + (resolvedActive === "messages" ? " is-active" : "")}
          onClick={handleMessagesClick}
          disabled={navBusy}
        >
          <span className="nav-icon">✉</span>
          メッセージ
        </button>

        <button
          type="button"
          className={
            "nav-item" + (resolvedActive === "notifications" ? " is-active" : "")
          }
          onClick={handleNotificationsClick}
          disabled={navBusy}
        >
          <span className="nav-icon-wrap">
            <span className="nav-icon">🔔</span>
            {hasUnreadLocal && <span className="nav-badge-dot" />}
          </span>
          通知
        </button>

        <button
          type="button"
          className={"nav-item" + (resolvedActive === "mypage" ? " is-active" : "")}
          onClick={handleMypageClick}
          disabled={navBusy}
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

          /* クリック/タップを確実に拾うための基本 */
          pointer-events: auto;
          user-select: none;
          overscroll-behavior: contain;
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
          transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;

          /* モバイルのタップ取りこぼし対策 */
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
        }

        .nav-item:disabled {
          opacity: 0.7;
          cursor: default;
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
          background: #f97316;
          border: 1px solid #fff;
        }
      `}</style>
    </>
  );
};

export default BottomNav;