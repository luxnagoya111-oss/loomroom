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
  partnerHandle: string; // ★ 表示用：@xxxxxx（相手ID短縮）
  partnerRole: "user" | "therapist" | "store" | "unknown";
  avatarUrl: string | null; // resolved (http)

  lastMessage: string;
  lastMessageTime: string;
  lastMessageAt: string; // ISO (sort key)
  unreadCount: number;
};

type DbUserMini = {
  id: string;
  name: string | null;
  role: string | null;
  avatar_url: string | null; // raw (http or storage path)
};

type DbTherapistMini = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null; // raw
};

type DbStoreMini = {
  owner_user_id: string | null;
  name: string | null;
  avatar_url: string | null; // raw
};

// uuid 判定
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

function safeText(v: any): string {
  return typeof v === "string" ? v.trim() : String(v ?? "").trim();
}

function formatHHMM(iso: string): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  const hh = dt.getHours().toString().padStart(2, "0");
  const mm = dt.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function isProbablyHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * ★ 6桁ID（表示用）
 * - uuid なら "-" を除去して先頭6文字
 * - それ以外も先頭6文字
 */
function toShortId(id: string): string {
  const s = safeText(id);
  if (!s) return "";
  const compact = isUuid(s) ? s.replace(/-/g, "") : s;
  return compact.slice(0, 6);
}

/**
 * ★ SearchPage を踏襲（bucket名も一致させる）
 */
const AVATAR_BUCKET = "avatars";

function resolveAvatarUrl(raw: string | null | undefined): string | null {
  const v = safeText(raw);
  if (!v) return null;
  if (isProbablyHttpUrl(v)) return v;

  const path = v.startsWith(`${AVATAR_BUCKET}/`)
    ? v.slice(AVATAR_BUCKET.length + 1)
    : v;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
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

        if (isUuid(authId)) {
          setViewerId(authId as UserId);
          return;
        }

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
        console.error("[messages.getRelationsForUser] error:", e);
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

        // 1) users 一括
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

        // 2) therapists 一括（avatar_url も取る）
        const therapistMap = new Map<
          string,
          { displayName: string; avatarUrl: string | null }
        >();
        if (partnerIds.length > 0) {
          const { data: thRows, error } = await supabase
            .from("therapists")
            .select("user_id, display_name, avatar_url")
            .in("user_id", partnerIds);

          if (error) {
            console.warn("[MessagesPage] therapists batch fetch error:", error);
          } else {
            (thRows ?? []).forEach((t: any) => {
              const rt = t as DbTherapistMini;
              const uid = safeText(rt.user_id);
              if (!uid) return;

              const dn = safeText(rt.display_name);
              const av = resolveAvatarUrl(rt.avatar_url);
              therapistMap.set(uid, { displayName: dn, avatarUrl: av });
            });
          }
        }

        // 3) stores 一括（owner_user_id で引く）
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
              const owner = safeText(rs.owner_user_id);
              if (!owner) return;

              const nm = safeText(rs.name) || "店舗";
              const av = resolveAvatarUrl(rs.avatar_url);
              storeMap.set(owner, { name: nm, avatarUrl: av });
            });
          }
        }

        const items: ThreadListItem[] = normalized
          .map(({ row, partnerId }) => {
            const u = usersMap.get(partnerId) ?? null;

            // role（users.role を正）
            const roleRaw = safeText(u?.role);
            const partnerRole: ThreadListItem["partnerRole"] =
              roleRaw === "store" || roleRaw === "therapist" || roleRaw === "user"
                ? (roleRaw as any)
                : "unknown";

            const storeOverride = storeMap.get(partnerId) ?? null;
            const therapistOverride = therapistMap.get(partnerId) ?? null;

            // 表示名：store > therapist > users.name > fallback
            const partnerName =
              safeText(storeOverride?.name)
                ? safeText(storeOverride?.name)
                : safeText(therapistOverride?.displayName)
                ? safeText(therapistOverride?.displayName)
                : safeText(u?.name)
                ? safeText(u?.name)
                : "相手";

            // ★ 表示ID：@xxxxxx（相手ID短縮）
            const partnerHandle = `@${toShortId(partnerId) || "------"}`;

            // avatar：store > users > therapist
            const avatarUrl =
              storeOverride?.avatarUrl ??
              resolveAvatarUrl(u?.avatar_url) ??
              therapistOverride?.avatarUrl ??
              null;

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

    let cancelled = false;

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

    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // ★ 追加：Realtime subscribe 前に auth 同期（詳細ページと同じ発想）
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          supabase.realtime.setAuth(token);
          // console.log("[messages RT] realtime auth set");
        } else {
          // console.log("[messages RT] no token");
        }
      } catch (e) {
        console.warn("[messages RT] getSession failed:", e);
      }

      if (cancelled) return;

      channel = supabase
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
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
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
                  title={t.partnerId} // ★ フルIDはツールチップで見える
                >
                  <div className="thread-main">
                    <div className="thread-header-row">
                      <div className="thread-name-row">
                        <div className="thread-avatar-inline">
                          <AvatarCircle
                            size={34}
                            avatarUrl={t.avatarUrl}
                            displayName={t.partnerName || "?"}
                            alt={t.partnerName || "avatar"}
                          />
                        </div>

                        {/* ★ ここを「2行構造」に変更 */}
                        <div className="thread-name-col">
                          <div className="thread-name-top">
                            <span className="thread-name">{t.partnerName}</span>

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

                          <div className="thread-name-bottom">
                            <span className="thread-handle">{t.partnerHandle}</span>
                          </div>
                        </div>
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
          display: block;
          padding: 10px 4px;
          text-decoration: none;
          color: inherit;
        }

        .thread-main {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .thread-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .thread-name-row {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          flex: 1;
        }

        .thread-avatar-inline {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* ★ 2行カラム */
        .thread-name-col {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .thread-name-top {
          display: flex;
          align-items: baseline;
          gap: 8px;
          min-width: 0;
        }

        .thread-name {
          font-size: 14px;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }

        .thread-name-bottom {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }

        /* ★ ここが「相手ID表示」 */
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
          padding-left: 44px; /* アイコン(34) + gap(10) */
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