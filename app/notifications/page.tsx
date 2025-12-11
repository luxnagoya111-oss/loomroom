"use client";

import React from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { getCurrentUserId } from "@/lib/auth";

// ログインユーザーID
const currentUserId = getCurrentUserId();

type FromKind = "user" | "therapist" | "store";

type NotifFrom = {
  kind: FromKind;
  id: string; // アカウントID（@以降など）
  name: string; // 表示名
  avatarUrl?: string; // アイコン画像のURL
};

type Notification = {
  id: string;
  type: "post" | "dm" | "system";
  from: NotifFrom;
  title: string;
  body: string;
  time: string;
  read: boolean;
};

// デモ通知
const demoNotifs: Notification[] = [
  {
    id: "n1",
    type: "post",
    from: {
      kind: "therapist",
      id: "taki",
      name: "TAKI",
      avatarUrl: "",
    },
    title: "フォロー中のセラピストが投稿しました",
    body: "TAKIさんが新しい投稿をしました。",
    time: "3分前",
    read: false,
  },
  {
    id: "n2",
    type: "dm",
    from: {
      kind: "therapist",
      id: "hiyori",
      name: "HIYORI",
      avatarUrl: "",
    },
    title: "新しいメッセージがあります",
    body: "セラピストから返信が届きました。",
    time: "1時間前",
    read: false,
  },
  {
    id: "n3",
    type: "system",
    from: {
      kind: "store",
      id: "loomroom",
      name: "LoomRoom",
      avatarUrl: "",
    },
    title: "LoomRoomからのお知らせ",
    body: "アプリのアップデート情報があります。",
    time: "昨日",
    read: true,
  },
];

// 共通 avatar-circle を使ったアイコン
function NotifAvatar({ from }: { from: NotifFrom }) {
  if (from.avatarUrl) {
    return (
      <div className="avatar-circle">
        <img
          src={from.avatarUrl}
          alt={from.name}
          className="avatar-circle-img"
        />
      </div>
    );
  }

  // 画像がないときは頭文字
  const initial =
    from.name && from.name.trim().length > 0
      ? from.name.trim().charAt(0).toUpperCase()
      : "?";

  return (
    <div className="avatar-circle">
      <span className="avatar-circle-text">{initial}</span>
    </div>
  );
}

export default function NotificationsPage() {
  const hasUnread = demoNotifs.some((n) => !n.read);

  return (
    <>
      <div className="app-shell">
        {/* ヘッダー */}
        <AppHeader title="通知" />

        {/* メイン */}
        <main className="app-main">
          <div className="notif-list">
            {demoNotifs.map((n) => (
              <div key={n.id} className="surface-card notif-card">
                <NotifAvatar from={n.from} />

                <div className="notif-main">
                  <div className="notif-title">{n.title}</div>
                  <div className="notif-body">{n.body}</div>
                  <div className="notif-time">{n.time}</div>
                </div>
              </div>
            ))}
          </div>
        </main>

        {/* 下ナビ：通知タブをアクティブ */}
        <BottomNav
          active="notifications"
          hasUnread={hasUnread}
        />
      </div>

      {/* このページ専用スタイル */}
      <style jsx>{`
        .app-main {
          padding: 12px 0 120px;
        }

        .notif-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 0 16px 16px;
        }

        .notif-card {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .notif-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .notif-title {
          font-size: 14px;
          font-weight: 600;
        }

        .notif-body {
          font-size: 12px;
          color: var(--text-sub);
        }

        .notif-time {
          font-size: 11px;
          color: var(--text-sub);
          margin-top: 2px;
        }
      `}</style>
    </>
  );
}