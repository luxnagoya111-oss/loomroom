// app/messages/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import AvatarCircle from "@/components/AvatarCircle";

import { getCurrentUserId } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import { getRelationsForUser } from "@/lib/repositories/relationRepository";
import { getThreadsForUser } from "@/lib/repositories/dmRepository";

import type { UserId } from "@/types/user";
import type { DbRelationRow, DbDmThreadRow } from "@/types/db";

// ==============================
// Types
// ==============================
type ThreadListItem = {
  threadId: string;
  partnerId: string;

  partnerName: string;
  partnerHandle: string;
  partnerRole: "user" | "therapist" | "store" | "unknown";
  avatarUrl: string | null;

  lastMessage: string;
  lastMessageTime: string;
  lastMessageAt: string; // ISO (sort key)
  unreadCount: number;
};

// users（解決に使う最小）
type DbUserMini = {
  id: string;
  name: string | null;
  role: string | null;
  avatar_url: string | null;
};

// therapists（display_name上書き用）
type DbTherapistMini = {
  user_id: string;
  display_name: string | null;
};

// stores（name上書き用：owner_user_idで紐づく）
type DbStoreMini = {
  owner_user_id: string | null;
  name: string | null;
  avatar_url: string | null;
};

// uuid 判定
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

function formatHHMM(iso: string): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  const hh = dt.getHours().toString().padStart(2, "0");
  const mm = dt.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

// ==============================
// Page
// ==============================
export default function MessagesPage() {
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);

  // SSRズレ防止：viewerId は state で決定（Auth uuid 優先）
  const [viewerId, setViewerId] = useState<UserId>("" as UserId);

  // 自分→相手 relations（uuid会員のみ）
  const [relations, setRelations] = useState<DbRelationRow[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  // viewerId 確定（Auth uuid を優先）
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const authId = data.user?.id ?? null;

        if (cancelled) return;

        // Auth uuid が取れたらそれを正にする
        if (isUuid(authId)) {
          setViewerId(authId as UserId);
          return;
        }

        // fallback（guest-xxxx 等）
        const fallback = getCurrentUserId();
        setViewerId((fallback ?? "") as UserId);
      } catch {
        const fallback = getCurrentUserId();
        setViewerId((fallback ?? "") as UserId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // relations を Supabase から取得（uuid 会員のみ）
  useEffect(() => {
    if (!isUuid(viewerId)) {
      setRelations([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const rows = await getRelationsForUser(viewerId as UserId);
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
  }, [viewerId]);

  // スレッド一覧を取得 → 相手プロフィール解決 → ブロック除外 → 整形
  useEffect(() => {
    if (!viewerId) return;

    // ゲストはサーバーDMなし
    if (!isUuid(viewerId)) {
      setThreads([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        // block 相手一覧
        const blocked = new Set<string>();
        relations.forEach((r) => {
          if (r.type === "block") blocked.add(r.target_id);
        });

        // 自分のスレッド一覧
        const base: DbDmThreadRow[] = (await getThreadsForUser(viewerId)) ?? [];

        // partnerId 抽出（last_message_at が無いスレは現状非表示）
        const normalized = base
          .map((row) => {
            const partnerId =
              row.user_a_id === viewerId ? row.user_b_id : row.user_a_id;

            if (!partnerId) return null;
            if (blocked.has(partnerId)) return null;
            if (!row.last_message_at) return null;

            return { row, partnerId };
          })
          .filter(
            (x): x is { row: DbDmThreadRow; partnerId: string } => x !== null
          );

        const partnerIds = Array.from(
          new Set(normalized.map((x) => x.partnerId))
        );

        // 相手 users 一括取得
        const usersMap = new Map<string, DbUserMini>();
        if (partnerIds.length > 0) {
          const { data: usersRows, error } = await supabase
            .from("users")
            .select("id, name, role, avatar_url")
            .in("id", partnerIds);

          if (error) {
            console.warn("[MessagesPage] users batch fetch error:", error);
          } else {
            (usersRows ?? []).forEach((u: any) => {
              const ru = u as DbUserMini;
              if (ru?.id) usersMap.set(ru.id, ru);
            });
          }
        }

        // 相手が therapist の場合 display_name を優先したい
        const therapistMap = new Map<string, string>();
        if (partnerIds.length > 0) {
          const { data: thRows, error } = await supabase
            .from("therapists")
            .select("user_id, display_name")
            .in("user_id", partnerIds);

          if (error) {
            console.warn("[MessagesPage] therapists batch fetch error:", error);
          } else {
            (thRows ?? []).forEach((t: any) => {
              const rt = t as DbTherapistMini;
              const uid = rt.user_id;
              const dn = rt.display_name?.trim() ?? "";
              if (uid && dn) therapistMap.set(uid, dn);
            });
          }
        }

        // 相手が store の場合 stores.name / stores.avatar_url を優先（owner_user_id で引く）
        const storeMap = new Map<string, { name: string; avatarUrl: string | null }>();
        if (partnerIds.length > 0) {
          const { data: stRows, error } = await supabase
            .from("stores")
            .select("owner_user_id, name, avatar_url")
            .in("owner_user_id", partnerIds);

          if (error) {
            console.warn("[MessagesPage] stores batch fetch error:", error);
          } else {
            (stRows ?? []).forEach((s: any) => {
              const rs = s as DbStoreMini;
              const owner = rs.owner_user_id ?? "";
              const nm = rs.name?.trim() ?? "";
              if (!owner) return;
              storeMap.set(owner, { name: nm || "店舗", avatarUrl: rs.avatar_url ?? null });
            });
          }
        }

        const items: ThreadListItem[] = normalized
          .map(({ row, partnerId }) => {
            const u = usersMap.get(partnerId) ?? null;

            // role 解決（users.role を正）
            const roleRaw = (u?.role ?? "").toString();
            const partnerRole: ThreadListItem["partnerRole"] =
              roleRaw === "store" || roleRaw === "therapist" || roleRaw === "user"
                ? (roleRaw as any)
                : "unknown";

            // 表示名：store > therapist > users.name > fallback
            const storeOverride = storeMap.get(partnerId) ?? null;
            const therapistOverride = therapistMap.get(partnerId) ?? null;

            const partnerName =
              storeOverride?.name?.trim()
                ? storeOverride.name.trim()
                : therapistOverride?.trim()
                ? therapistOverride.trim()
                : u?.name?.trim()
                ? u.name.trim()
                : "相手";

            const partnerHandle =
              u?.name && u.name.trim().length > 0 ? `@${u.name.trim()}` : `@${partnerId}`;

            // avatar：store(stores.avatar_url) > users.avatar_url
            const avatarUrl =
              storeOverride?.avatarUrl?.trim?.() ? storeOverride.avatarUrl : u?.avatar_url ?? null;

            const lastMessageAt = row.last_message_at as string;
            const lastMessageTime = formatHHMM(lastMessageAt);

            const unreadCount =
              row.user_a_id === viewerId ? row.unread_for_a ?? 0 : row.unread_for_b ?? 0;

            return {
              threadId: row.thread_id,
              partnerId,
              partnerName,
              partnerHandle,
              partnerRole,
              avatarUrl,
              lastMessage: row.last_message ?? "",
              lastMessageTime,
              lastMessageAt,
              unreadCount,
            };
          })
          .sort(
            (a, b) =>
              new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
          );

        if (cancelled) return;
        setThreads(items);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewerId, relations, reloadKey]);

  // Realtime：dm_threads の INSERT / UPDATE を購読して再読込
  useEffect(() => {
    if (!viewerId || !isUuid(viewerId)) return;

    const handleChange = (payload: any) => {
      const newRow = (payload.new ?? null) as DbDmThreadRow | null;
      const oldRow = (payload.old ?? null) as DbDmThreadRow | null;

      const isMine =
        (newRow &&
          (newRow.user_a_id === viewerId || newRow.user_b_id === viewerId)) ||
        (oldRow &&
          (oldRow.user_a_id === viewerId || oldRow.user_b_id === viewerId));

      if (!isMine) return;
      setReloadKey((k) => k + 1);
    };

    const channel = supabase
      .channel(`dm_threads_user_${viewerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_threads" },
        handleChange
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "dm_threads" },
        handleChange
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [viewerId]);

  const hasUnread = useMemo(() => threads.some((t) => t.unreadCount > 0), [threads]);

  // ゲスト表示
  if (!isUuid(viewerId)) {
    return (
      <div className="app-shell">
        <AppHeader title="メッセージ" />
        <main className="app-main">
          <p className="messages-empty-sub">
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
                    <AvatarCircle
                      size={40}
                      avatarUrl={t.avatarUrl}
                      displayName={t.partnerName || "?"}
                    />
                  </div>

                  <div className="thread-main">
                    <div className="thread-header-row">
                      <div className="thread-name">
                        {t.partnerName}
                        <span className="thread-handle">{t.partnerHandle}</span>
                        {t.partnerRole !== "unknown" && (
                          <span className="thread-role">
                            {t.partnerRole === "store"
                              ? "店舗"
                              : t.partnerRole === "therapist"
                              ? "セラピスト"
                              : "ユーザー"}
                          </span>
                        )}
                      </div>
                      <div className="thread-time">{t.lastMessageTime}</div>
                    </div>

                    <div className="thread-body-row">
                      <div className="thread-last-message">
                        {t.lastMessage || "（メッセージなし）"}
                      </div>

                      {t.unreadCount > 0 && (
                        <span className="thread-unread-badge">
                          {t.unreadCount > 99 ? "99+" : t.unreadCount}
                        </span>
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
          line-height: 1.6;
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
          gap: 6px;
        }

        .thread-header-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 8px;
        }

        .thread-name {
          display: flex;
          align-items: baseline;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }

        .thread-handle {
          font-size: 11px;
          color: var(--muted-foreground);
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }

        .thread-role {
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface-soft);
          color: var(--text-sub);
          font-weight: 600;
          flex-shrink: 0;
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

        .thread-unread-badge {
          min-width: 18px;
          height: 18px;
          border-radius: 999px;
          background: var(--accent);
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 6px;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}