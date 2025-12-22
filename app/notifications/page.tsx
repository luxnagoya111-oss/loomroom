// app/notifications/page.tsx
"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import AvatarCircle from "@/components/AvatarCircle";

import { supabase } from "@/lib/supabaseClient";

type NotificationType = "dm" | "like" | "follow" | "system";

type DbNotificationRow = {
  id: string;
  type: NotificationType;
  user_id: string; // legacy receiver
  to_user_id: string | null; // receiver
  from_user_id: string | null;
  thread_id: string | null;
  post_id: string | null;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

type FromUser = {
  id: string;
  name: string | null;
  avatar_url: string | null;
  role: string | null;
};

function resolveAvatarUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const s = String(raw);
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  // Supabase Storage path想定（avatars/ 付きでも無しでも）
  const path = s.startsWith("avatars/") ? s.replace(/^avatars\//, "") : s;
  try {
    return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl ?? null;
  } catch {
    return null;
  }
}

function formatTime(iso: string): string {
  // ざっくり：YYYY/MM/DD HH:mm
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${hh}:${mm}`;
}

function typeLabel(t: NotificationType): string {
  switch (t) {
    case "dm":
      return "メッセージ";
    case "like":
      return "いいね";
    case "follow":
      return "フォロー";
    case "system":
      return "お知らせ";
  }
}

function buildTitle(t: NotificationType, fromName?: string | null): string {
  const name = fromName || "だれか";
  switch (t) {
    case "dm":
      return `${name} からメッセージ`;
    case "like":
      return `${name} があなたの投稿にいいね`;
    case "follow":
      return `${name} があなたをフォロー`;
    case "system":
      return `お知らせ`;
  }
}

export default function NotificationsPage() {
  const router = useRouter();

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [items, setItems] = useState<DbNotificationRow[]>([]);
  const [fromUsers, setFromUsers] = useState<Record<string, FromUser>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [filter, setFilter] = useState<"all" | NotificationType>("all");

  const unreadCount = useMemo(
    () => items.filter((n) => !n.is_read).length,
    [items]
  );

  const filteredItems = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((n) => n.type === filter);
  }, [items, filter]);

  const canShow = !!viewerId;

  const fetchFromUsers = useCallback(async (userIds: string[]) => {
    const uniq = Array.from(new Set(userIds)).filter(Boolean);
    const missing = uniq.filter((id) => !fromUsers[id]);
    if (missing.length === 0) return;

    const { data, error } = await supabase
      .from("users")
      .select("id, name, avatar_url, role")
      .in("id", missing);

    if (!error && data) {
      const map: Record<string, FromUser> = {};
      for (const u of data as any[]) {
        map[u.id] = {
          id: u.id,
          name: u.name ?? null,
          avatar_url: u.avatar_url ?? null,
          role: u.role ?? null,
        };
      }
      setFromUsers((prev) => ({ ...prev, ...map }));
    }
  }, [fromUsers]);

  const load = useCallback(
    async (opts?: { before?: string | null; append?: boolean }) => {
      if (!viewerId) return;
      const before = opts?.before ?? null;
      const append = opts?.append ?? false;

      const limit = 30;

      let q = supabase
        .from("notifications")
        .select(
          "id,type,user_id,to_user_id,from_user_id,thread_id,post_id,body,link,is_read,created_at"
        )
        .eq("to_user_id", viewerId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (before) {
        q = q.lt("created_at", before);
      }

      const { data, error } = await q;
      if (error) return;

      const rows = (data ?? []) as DbNotificationRow[];
      if (append) {
        setItems((prev) => [...prev, ...rows]);
      } else {
        setItems(rows);
      }

      const ids = rows.map((r) => r.from_user_id).filter(Boolean) as string[];
      if (ids.length) await fetchFromUsers(ids);
    },
    [viewerId, fetchFromUsers]
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id ?? null;
      setViewerId(uid);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!viewerId) return;
    load().catch(() => {});
  }, [viewerId, load]);

  const onLoadMore = async () => {
    if (!viewerId) return;
    if (loadingMore) return;
    if (items.length === 0) return;

    setLoadingMore(true);
    try {
      const last = items[items.length - 1];
      await load({ before: last.created_at, append: true });
    } finally {
      setLoadingMore(false);
    }
  };

  const markRead = async (id: string) => {
    // 既読化（失敗してもUX優先で先にUIを更新）
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  };

  const onOpen = async (n: DbNotificationRow) => {
    await markRead(n.id);

    if (n.link) {
      router.push(n.link);
      return;
    }

    if (n.type === "dm" && n.thread_id) {
      router.push(`/messages/${n.thread_id}`);
      return;
    }
    if (n.type === "like" && n.post_id) {
      router.push(`/posts/${n.post_id}`);
      return;
    }
    if (n.type === "follow" && n.from_user_id) {
      router.push(`/mypage/${n.from_user_id}`);
      return;
    }
    // system は遷移なし
  };

  return (
    <>
      <div className="app-shell">
        <AppHeader title="通知" />

        <main className="app-main">
          {loading ? (
            <div className="empty-state">読み込み中…</div>
          ) : !canShow ? (
            <div className="empty-state">
              <div className="empty-title">ログインが必要です</div>
              <div className="empty-text">
                通知を表示するにはログインしてください。
              </div>
            </div>
          ) : (
            <div className="wrap">
              <div className="filters">
                <button
                  className={filter === "all" ? "chip active" : "chip"}
                  onClick={() => setFilter("all")}
                >
                  すべて
                </button>
                <button
                  className={filter === "dm" ? "chip active" : "chip"}
                  onClick={() => setFilter("dm")}
                >
                  DM
                </button>
                <button
                  className={filter === "like" ? "chip active" : "chip"}
                  onClick={() => setFilter("like")}
                >
                  いいね
                </button>
                <button
                  className={filter === "follow" ? "chip active" : "chip"}
                  onClick={() => setFilter("follow")}
                >
                  フォロー
                </button>
                <button
                  className={filter === "system" ? "chip active" : "chip"}
                  onClick={() => setFilter("system")}
                >
                  お知らせ
                </button>
              </div>

              {filteredItems.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-title">通知はまだありません</div>
                  <div className="empty-text">
                    投稿への反応やメッセージが届くと、ここに表示されます。
                  </div>
                </div>
              ) : (
                <>
                  <div className="notif-list">
                    {filteredItems.map((n) => {
                      const from = n.from_user_id ? fromUsers[n.from_user_id] : null;
                      const fromName = from?.name ?? null;
                      const avatar = resolveAvatarUrl(from?.avatar_url);
                      const title = buildTitle(n.type, fromName);
                      const sub = n.body || typeLabel(n.type);

                      return (
                        <button
                          key={n.id}
                          className={n.is_read ? "notif read" : "notif"}
                          onClick={() => onOpen(n)}
                        >
                          <div className="left">
                            <AvatarCircle
                              avatarUrl={avatar}
                              size={44}
                            />
                          </div>

                          <div className="mid">
                            <div className="row1">
                              <div className="title">{title}</div>
                              <div className="time">{formatTime(n.created_at)}</div>
                            </div>
                            <div className="row2">{sub}</div>
                          </div>

                          {!n.is_read && <span className="dot" />}
                        </button>
                      );
                    })}
                  </div>

                  <div className="more">
                    <button className="moreBtn" onClick={onLoadMore} disabled={loadingMore}>
                      {loadingMore ? "読み込み中…" : "さらに読み込む"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </main>

        <BottomNav active="notifications" hasUnread={unreadCount > 0} />
      </div>

      <style jsx>{`
        .app-main {
          padding: 18px 14px 120px;
          display: flex;
          justify-content: center;
        }
        .wrap {
          width: 100%;
          max-width: 560px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .filters {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .chip {
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          cursor: pointer;
        }
        .chip.active {
          border-color: rgba(212, 175, 55, 0.55);
          box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.12) inset;
        }

        .empty-state {
          width: 100%;
          max-width: 420px;
          text-align: center;
          padding: 32px 20px;
          border-radius: 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          margin: 0 auto;
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
          gap: 10px;
        }
        .notif {
          width: 100%;
          display: grid;
          grid-template-columns: 56px 1fr auto;
          gap: 10px;
          align-items: center;
          padding: 12px 12px;
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--surface);
          text-align: left;
          cursor: pointer;
          position: relative;
        }
        .notif.read {
          opacity: 0.78;
        }
        .left {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .mid {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
        }
        .row1 {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
        }
        .title {
          font-size: 13px;
          font-weight: 650;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .time {
          font-size: 11px;
          color: var(--text-sub);
          flex: 0 0 auto;
        }
        .row2 {
          font-size: 12px;
          color: var(--text-sub);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: rgba(212, 175, 55, 0.95);
          margin-left: 6px;
        }
        .more {
          display: flex;
          justify-content: center;
          padding: 8px 0 0;
        }
        .moreBtn {
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          border-radius: 999px;
          padding: 10px 14px;
          font-size: 12px;
          cursor: pointer;
        }
        .moreBtn:disabled {
          opacity: 0.6;
          cursor: default;
        }

        /* 通知内はリンク色を使わない */
        .notif,
        .notif * {
          color: var(--text);
          text-decoration: none;
        }
      `}</style>
    </>
  );
}