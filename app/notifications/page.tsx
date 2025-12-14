"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { getCurrentUserId } from "@/lib/auth";

type FromKind = "user" | "therapist" | "store";

type Notification = {
  id: string;
  type: "post" | "dm" | "system";
  from_kind: FromKind;
  title: string;
  body: string;
  created_at: string;
  is_read: boolean;
};

export default function NotificationsPage() {
  const [currentUserId, setCurrentUserId] = useState<string>("guest");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = getCurrentUserId();
    setCurrentUserId(id);

    // 🔹 現時点では通知テーブル未接続なので空で確定
    setNotifications([]);
    setLoading(false);
  }, []);

  const hasUnread = false; // ← 後で Supabase 接続時に算出

  return (
    <>
      <div className="app-shell">
        <AppHeader title="通知" />

        <main className="app-main">
          {loading ? (
            <div className="empty-state">読み込み中…</div>
          ) : notifications.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">通知はまだありません</div>
              <div className="empty-text">
                投稿への反応やメッセージが届くと、ここに表示されます。
              </div>
            </div>
          ) : (
            <div className="notif-list">
              {/* 将来 Supabase 接続時にここに map を追加 */}
            </div>
          )}
        </main>

        <BottomNav active="notifications" hasUnread={hasUnread} />
      </div>

      <style jsx>{`
        .app-main {
          padding: 24px 16px 120px;
          display: flex;
          justify-content: center;
        }

        .empty-state {
          max-width: 360px;
          text-align: center;
          padding: 32px 20px;
          border-radius: 16px;
          background: var(--surface);
          border: 1px solid var(--border);
        }

        .empty-title {
          font-size: 15px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .empty-text {
          font-size: 13px;
          color: var(--text-sub);
          line-height: 1.6;
        }

        .notif-list {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
      `}</style>
    </>
  );
}