"use client";

import React, { useEffect, useState } from "react";
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

  // 公開プロフィール系は「マイ」扱いに寄せる
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

  // ★ 追加：通知ドットはローカルで即時に消せるようにする
  const [hasUnreadLocal, setHasUnreadLocal] = useState<boolean>(hasUnread);

  // 追加：DBロール & 紐づきID（URL遷移用）
  const [dbRole, setDbRole] = useState<DbUserRow["role"]>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [therapistId, setTherapistId] = useState<string | null>(null);

  // 初期：ID確定
  useEffect(() => {
    const id = getCurrentUserId();
    setCurrentUserId(id);
    setIsGuest(isGuestId(id));
  }, []);

  // props で unread が更新されたときは同期（親が再計算した場合の保険）
  useEffect(() => {
    setHasUnreadLocal(hasUnread);
  }, [hasUnread]);

  // ★ UUID（ログイン済み）なら DB から role / storeId / therapistId を確定
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
        // users.role
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

        // role に応じて storeId / therapistId を引く（公開ページ遷移で必要）
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
          // user
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

  const go = (href: string) => {
    router.push(href);
  };

  const handleMessagesClick = () => {
    if (isGuest) {
      go("/login");
      return;
    }
    go("/messages");
  };

  const handleNotificationsClick = async () => {
    const id = currentUserId;

    if (!id || isGuestId(id)) {
      go("/login");
      return;
    }

    try {
      // 未読通知を既読にする（ユーザーIDで統一）
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", id)
        .eq("is_read", false);

      if (error) {
        console.error("[BottomNav] mark notifications read error:", error);
      } else {
        // 🔔ドットを即時に消す
        setHasUnreadLocal(false);
      }
    } catch (e) {
      console.error("[BottomNav] mark notifications read failed:", e);
    }

    go("/notifications");
  };

  const handleMypageClick = () => {
    const id = currentUserId;

    if (!id || isGuestId(id)) {
      go("/login");
      return;
    }

    // ★ DB role 優先で分岐
    if (dbRole === "store") {
      if (storeId) {
        // 店舗の公開プロフィールへ
        go(`/store/${storeId}`);
      } else {
        // フォールバック
        go(`/mypage/${id}`);
      }
      return;
    }

    if (dbRole === "therapist") {
      if (therapistId) {
        // セラピストの公開プロフィールへ
        go(`/therapist/${therapistId}`);
      } else {
        go(`/mypage/${id}`);
      }
      return;
    }

    // 一般ユーザー
    go(`/mypage/${id}`);
  };

  return (
    <>
      <nav className="bottom-nav">
        <button
          type="button"
          className={"nav-item" + (resolvedActive === "home" ? " is-active" : "")}
          onClick={() => go("/")}
        >
          <span className="nav-icon">🏠</span>
          ホーム
        </button>

        <button
          type="button"
          className={"nav-item" + (resolvedActive === "search" ? " is-active" : "")}
          onClick={() => go("/search")}
        >
          <span className="nav-icon">🔍</span>
          さがす
        </button>

        <button
          type="button"
          className={"nav-item" + (resolvedActive === "compose" ? " is-active" : "")}
          onClick={() => go("/compose")}
        >
          <span className="nav-icon nav-icon-compose">＋</span>
        </button>

        <button
          type="button"
          className={"nav-item" + (resolvedActive === "messages" ? " is-active" : "")}
          onClick={handleMessagesClick}
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
        >
          <span className="nav-icon-wrap">
            <span className="nav-icon">🔔</span>
            {/* ★ local を見る */}
            {hasUnreadLocal && <span className="nav-badge-dot" />}
          </span>
          通知
        </button>

        <button
          type="button"
          className={"nav-item" + (resolvedActive === "mypage" ? " is-active" : "")}
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
          transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
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