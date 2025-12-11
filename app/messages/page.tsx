// app/messages/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { getCurrentUserId } from "@/lib/auth";
import { getRelationsForUser } from "@/lib/repositories/relationRepository";
import { getThreadsForUser } from "@/lib/repositories/dmRepository";
import { supabase } from "@/lib/supabaseClient";
import type { UserId } from "@/types/user";
import type { DbRelationRow, DbDmThreadRow } from "@/types/db";

// 一覧用の表示モデル
type ThreadListItem = {
  threadId: string;
  partnerId: string;
  partnerName: string; // いまは partnerId をそのまま表示
  lastMessage: string;
  lastMessageTime: string;
  lastMessageAt: string; // ソート用 ISO
  unreadCount: number;
};

// uuid 判定用
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

// シンプルなアバター（頭文字だけ表示）
function ThreadAvatar({ name }: { name: string }) {
  const initial =
    name && name.trim().length > 0
      ? name.trim().charAt(0).toUpperCase()
      : "?";
  return (
    <div className="avatar-circle thread-avatar">
      <span className="avatar-circle-text">{initial}</span>
      <style jsx>{`
        .thread-avatar {
          width: 40px;
          height: 40px;
          border-radius: 999px;
          background: var(--surface);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}

export default function MessagesPage() {
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // SSRズレ防止：currentUserId は state + useEffect で決定
  const [currentUserId, setCurrentUserId] = useState<UserId>("" as UserId);

  // relations（自分 → 相手）一覧
  const [relations, setRelations] = useState<DbRelationRow[]>([]);

  // currentUserId を確定
  useEffect(() => {
    const id = getCurrentUserId();
    setCurrentUserId(id as UserId);
  }, []);

  // relations を Supabase から取得（uuid 会員のみ）
  useEffect(() => {
    if (!isUuid(currentUserId)) {
      setRelations([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const rows = await getRelationsForUser(currentUserId as UserId);
        if (cancelled) return;
        setRelations(rows ?? []);
      } catch (e: any) {
        if (cancelled) return;
        console.error(
          "[messages.getRelationsForUser] error:",
          e,
          "message:",
          e?.message,
          "code:",
          e?.code
        );
        setRelations([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  // DMスレッド一覧（Supabase）を取得して、block済みを除外して ThreadListItem に整形
  useEffect(() => {
    // userId まだ不明なら何もしない
    if (!currentUserId) return;

    // ゲスト（非UUID）はサーバーDMなし
    if (!isUuid(currentUserId)) {
      setThreads([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        // block されている相手一覧をセット化
        const blockedTargets = new Set<string>();
        relations.forEach((r) => {
          if (r.type === "block") blockedTargets.add(r.target_id);
        });

        // Supabase から自分のDMスレッド一覧を取得
        const baseThreads: DbDmThreadRow[] =
          (await getThreadsForUser(currentUserId)) ?? [];

        const items: ThreadListItem[] = baseThreads
          .map((row) => {
            const partnerId =
              row.user_a_id === currentUserId
                ? row.user_b_id
                : row.user_a_id;

            // relations テーブルで block されている相手なら一覧に出さない
            if (partnerId && blockedTargets.has(partnerId)) return null;

            // last_message_at がないスレッドは、一覧から除外（今は非表示）
            if (!row.last_message_at) return null;

            const lastMessage = row.last_message ?? "";
            const lastMessageAt = row.last_message_at;

            const dt = new Date(lastMessageAt);
            const hh = dt.getHours().toString().padStart(2, "0");
            const mm = dt.getMinutes().toString().padStart(2, "0");
            const lastMessageTime = `${hh}:${mm}`;

            const unreadCount =
              row.user_a_id === currentUserId
                ? row.unread_for_a ?? 0
                : row.unread_for_b ?? 0;

            const partnerName = partnerId ?? "相手";

            return {
              threadId: row.thread_id,
              partnerId: partnerId ?? "",
              partnerName,
              lastMessage,
              lastMessageTime,
              lastMessageAt,
              unreadCount,
            } as ThreadListItem;
          })
          .filter((x): x is ThreadListItem => x !== null)
          // lastMessageAt 降順でソート
          .sort((a, b) => {
            return (
              new Date(b.lastMessageAt).getTime() -
              new Date(a.lastMessageAt).getTime()
            );
          });

        if (cancelled) return;
        setThreads(items);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, relations, reloadKey]);

  // ==============================
  // Realtime: dm_threads の INSERT / UPDATE を購読して一覧を再読み込み
  // ==============================
  useEffect(() => {
    if (!currentUserId || !isUuid(currentUserId)) return;

    const handleChange = (payload: any) => {
      const newRow = (payload.new ?? null) as DbDmThreadRow | null;
      const oldRow = (payload.old ?? null) as DbDmThreadRow | null;

      const isMine =
        (newRow &&
          (newRow.user_a_id === currentUserId ||
            newRow.user_b_id === currentUserId)) ||
        (oldRow &&
          (oldRow.user_a_id === currentUserId ||
            oldRow.user_b_id === currentUserId));

      if (!isMine) return;

      // 自分が関係するスレッドに変化があった場合のみ再取得トリガー
      setReloadKey((k) => k + 1);
    };

    const channel = supabase
      .channel(`dm_threads_user_${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dm_threads",
        },
        handleChange
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dm_threads",
        },
        handleChange
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const hasUnread = threads.some((t) => t.unreadCount > 0);

  // ゲストの場合の表示（任意）
  if (!isUuid(currentUserId)) {
    return (
      <div className="app-shell">
        <AppHeader title="メッセージ" />
        <main className="app-main">
          <p className="text-sm text-gray-500">
            ログインすると、DM（メッセージ）が使えるようになります。
          </p>
        </main>
        <BottomNav active="messages" hasUnread={false} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <AppHeader title="メッセージ" />

      <main className="app-main">
        {loading ? (
          <div className="messages-loading">
            <p>読み込み中...</p>
          </div>
        ) : threads.length === 0 ? (
          <div className="messages-empty">
            <p>メッセージスレッドはまだありません。</p>
            <p className="messages-empty-sub">
              セラピストや店舗のプロフィールから DM を送ると、ここに表示されます。
            </p>
          </div>
        ) : (
          <ul className="thread-list">
            {threads.map((t) => (
              <li key={t.threadId} className="thread-item">
                <Link
                  href={`/messages/${encodeURIComponent(t.threadId)}`}
                  className="thread-link"
                >
                  <div className="thread-avatar-wrap">
                    <ThreadAvatar name={t.partnerName || t.partnerId} />
                  </div>
                  <div className="thread-main">
                    <div className="thread-header-row">
                      <div className="thread-name">
                        {t.partnerName || t.partnerId}
                      </div>
                      <div className="thread-time">{t.lastMessageTime}</div>
                    </div>
                    <div className="thread-body-row">
                      <div className="thread-last-message">
                        {t.lastMessage || "（メッセージなし）"}
                      </div>
                      {t.unreadCount > 0 && (
                        <span className="thread-unread-dot" />
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      <BottomNav active="messages" hasUnread={hasUnread} />

      <style jsx>{`
        .app-shell {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          background: var(--background);
          color: var(--foreground);
        }

        .app-main {
          flex: 1;
          padding: 12px 12px 72px;
          max-width: 640px;
          margin: 0 auto;
          width: 100%;
        }

        .messages-loading,
        .messages-empty {
          padding: 24px 8px;
          text-align: center;
          color: var(--muted-foreground);
        }

        .messages-empty-sub {
          margin-top: 8px;
          font-size: 12px;
          color: var(--muted-foreground);
        }

        .thread-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .thread-item {
          border-bottom: 1px solid var(--border-subtle);
        }

        .thread-link {
          display: flex;
          gap: 10px;
          padding: 10px 4px;
          text-decoration: none;
          color: inherit;
        }

        .thread-avatar-wrap {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .thread-main {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .thread-header-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 8px;
        }

        .thread-name {
          font-size: 14px;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .thread-time {
          font-size: 11px;
          color: var(--muted-foreground);
          flex-shrink: 0;
        }

        .thread-body-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }

        .thread-last-message {
          font-size: 13px;
          color: var(--muted-foreground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .thread-unread-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: var(--accent);
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}