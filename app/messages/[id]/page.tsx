// app/messages/[id]/page.tsx
"use client";

import React, {
  useState,
  useEffect,
  useRef,
  ChangeEvent,
  KeyboardEvent,
} from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import AvatarCircle from "@/components/AvatarCircle";

import { getCurrentUserId, getCurrentUserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

import {
  getThreadById,
  getMessagesForThread,
  sendMessage,
  markThreadAsRead,
} from "@/lib/repositories/dmRepository";
import { canSendDm } from "@/lib/dmPolicy";

import type { UserId, Role } from "@/types/user";
import type { ThreadId } from "@/types/dm";
import type { DbDmMessageRow, DbDmThreadRow } from "@/types/db";

const hasUnread = false;

type Message = {
  id: string;
  from: "me" | "partner";
  text: string;
  time: string;
  date: string;
};

type DbTherapistRowForStatus = {
  id: string;
  user_id: string;
  store_id: string | null;
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
  id: string;
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

function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function autosizeTextarea(el: HTMLTextAreaElement, maxRows = 5) {
  // いったん縮めて scrollHeight を正しく測る
  el.style.height = "0px";

  const next = el.scrollHeight;
  el.style.height = `${next}px`;

  // スクロールバーは出さない
  el.style.overflowY = "hidden";

}

function formatDateString(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function normalizeRole(raw: string | null | undefined): Role {
  const v = (raw ?? "").toString();
  if (v === "store" || v === "therapist" || v === "user") return v;
  return "guest";
}

function mapDbToUi(msg: DbDmMessageRow, currentUserId: string): Message {
  const d = new Date(msg.created_at);
  return {
    id: msg.id,
    from: msg.from_user_id === currentUserId ? "me" : "partner",
    text: msg.text,
    time: formatTime(d),
    date: formatDateString(d),
  };
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

function isProbablyHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * ★ Avatar URL 解決（storage path / http 両対応）
 * - raw が http(s) ならそのまま
 * - それ以外は avatars bucket の publicUrl に変換
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

function DateDivider({ date }: { date: string }) {
  return (
    <div className="date-divider">
      <span>{date}</span>
    </div>
  );
}

// ★ プロフィール遷移先を role から解決
function getProfileHref(role: Role, userId: string): string {
  const id = safeText(userId);
  if (!id) return "#";
  if (role === "therapist") return `/therapist/${id}`;
  if (role === "store") return `/store/${id}`;
  return `/mypage/${id}`;
}

const MessageDetailPage: React.FC = () => {
  const params = useParams();
  const rawId = (params?.id as string) || "";
  const threadId = rawId as ThreadId;

  const [currentUserId, setCurrentUserId] = useState<UserId>("" as UserId);
  const [currentRole, setCurrentRole] = useState<Role>("guest");

  const [myName, setMyName] = useState<string>("You");
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);

  const [isUnaffiliatedTherapist, setIsUnaffiliatedTherapist] =
    useState<boolean>(false);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(false);

  const [thread, setThread] = useState<DbDmThreadRow | null>(null);
  const [partnerId, setPartnerId] = useState<UserId | "">("" as any);

  const [partnerName, setPartnerName] = useState<string>("メッセージ相手");
  const [partnerHandle, setPartnerHandle] = useState<string>("");
  const [partnerRole, setPartnerRole] = useState<Role>("guest");
  const [partnerAvatarUrl, setPartnerAvatarUrl] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isBlocked, setIsBlocked] = useState(false);

  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // viewerId（Auth uuid 正）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const authId = data.user?.id ?? null;

        if (cancelled) return;

        if (isUuid(authId)) setCurrentUserId(authId as UserId);
        else setCurrentUserId((getCurrentUserId() ?? "") as UserId);
      } catch {
        if (!cancelled) setCurrentUserId((getCurrentUserId() ?? "") as UserId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // viewerRole（DB users.role を優先して解決）
  useEffect(() => {
    if (!currentUserId) return;

    let cancelled = false;
    (async () => {
      // まず local fallback
      let role: Role = getCurrentUserRole();

      // uuid会員なら DB を正にする
      if (isUuid(currentUserId)) {
        const { data, error } = await supabase
          .from("users")
          .select("role")
          .eq("id", currentUserId)
          .maybeSingle<{ role: string | null }>();

        if (!cancelled && !error) {
          const dbRole = normalizeRole(data?.role);
          if (dbRole !== "guest") role = dbRole;
        }
      }

      if (!cancelled) setCurrentRole(role);
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  // threadId バリデーション（uuid前提）
  useEffect(() => {
    if (!threadId) return;
    if (!isUuid(threadId)) {
      setError("このスレッドIDは無効です（uuidではありません）。");
      setLoading(false);
    }
  }, [threadId]);

  // 自分の name / avatar（表示用）
  useEffect(() => {
    if (!currentUserId || !isUuid(currentUserId)) return;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, avatar_url")
        .eq("id", currentUserId)
        .maybeSingle<{ id: string; name: string | null; avatar_url: string | null }>();

      if (cancelled) return;
      if (error) {
        console.warn("[Messages] my users fetch error:", error);
        return;
      }
      if (data?.name?.trim()) setMyName(data.name.trim());
      setMyAvatarUrl(resolveAvatarUrl(data?.avatar_url));
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  // 無所属セラピスト判定
  useEffect(() => {
    if (!currentUserId || currentRole !== "therapist" || !isUuid(currentUserId)) {
      setIsUnaffiliatedTherapist(false);
      setCheckingStatus(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setCheckingStatus(true);

        const { data, error } = await supabase
          .from("therapists")
          .select("id, user_id, store_id")
          .eq("user_id", currentUserId)
          .maybeSingle<DbTherapistRowForStatus>();

        if (cancelled) return;

        if (error || !data) {
          console.error("[Messages] therapist status load error:", error);
          setIsUnaffiliatedTherapist(true);
          return;
        }

        setIsUnaffiliatedTherapist(!data.store_id);
      } catch (e) {
        if (!cancelled) {
          console.error("[Messages] therapist status check exception:", e);
          setIsUnaffiliatedTherapist(true);
        }
      } finally {
        if (!cancelled) setCheckingStatus(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, currentRole]);

  // thread取得 → partnerId
  useEffect(() => {
    if (!threadId || !currentUserId) return;
    if (!isUuid(threadId)) return;

    let cancelled = false;

    (async () => {
      try {
        const th = await getThreadById(threadId);
        if (cancelled) return;

        setThread(th);

        if (th) {
          const other =
            th.user_a_id === currentUserId ? th.user_b_id : th.user_a_id;
          setPartnerId((other ?? "") as any);
        } else {
          setPartnerId("" as any);
        }
      } catch (e) {
        console.error("Failed to load dm thread:", e);
        if (!cancelled) {
          setThread(null);
          setPartnerId("" as any);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [threadId, currentUserId]);

  // 相手の表示情報（users.role 正）
  useEffect(() => {
    if (!partnerId) {
      setPartnerName("メッセージ相手");
      setPartnerHandle("");
      setPartnerRole("guest");
      setPartnerAvatarUrl(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data: u, error: uErr } = await supabase
          .from("users")
          .select("id, name, role, avatar_url")
          .eq("id", partnerId)
          .maybeSingle<DbUserMini>();

        if (cancelled) return;
        if (uErr) console.warn("[Messages] partner users fetch error:", uErr);

        const resolvedRole = normalizeRole(u?.role);
        setPartnerRole(resolvedRole);

        // ★ 変更：相手ID6桁（一覧と同ルール）
        const handle = `@${toShortId(partnerId) || "------"}`;
        setPartnerHandle(handle);

        let resolvedName = u?.name?.trim() ? u.name.trim() : "メッセージ相手";
        let resolvedAvatar: string | null = resolveAvatarUrl(u?.avatar_url);

        if (resolvedRole === "therapist") {
          const { data: th } = await supabase
            .from("therapists")
            .select("user_id, display_name, avatar_url")
            .eq("user_id", partnerId)
            .maybeSingle<DbTherapistMini>();

          if (!cancelled && th) {
            if (th.display_name?.trim()) resolvedName = th.display_name.trim();
            if (!resolvedAvatar) resolvedAvatar = resolveAvatarUrl(th.avatar_url);
          }
        }

        if (resolvedRole === "store") {
          const { data: st } = await supabase
            .from("stores")
            .select("id, owner_user_id, name, avatar_url")
            .eq("owner_user_id", partnerId)
            .maybeSingle<DbStoreMini>();

          if (!cancelled && st) {
            if (st.name?.trim()) resolvedName = st.name.trim();
            const stAv = resolveAvatarUrl(st.avatar_url);
            if (stAv) resolvedAvatar = stAv;
          }
        }

        if (cancelled) return;
        setPartnerName(resolvedName);
        setPartnerAvatarUrl(resolvedAvatar);
      } catch (e) {
        if (cancelled) return;
        console.warn("[Messages] resolve partner failed:", e);

        // ★ フォールバックも6桁IDへ
        setPartnerName("メッセージ相手");
        setPartnerHandle(partnerId ? `@${toShortId(partnerId)}` : "");
        setPartnerRole("guest");
        setPartnerAvatarUrl(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [partnerId]);

  // ブロック判定（uuid同士のみ）
  useEffect(() => {
    if (!currentUserId || !partnerId) {
      setIsBlocked(false);
      return;
    }
    if (!isUuid(currentUserId) || !isUuid(partnerId)) {
      setIsBlocked(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("relations")
          .select("type")
          .eq("user_id", currentUserId)
          .eq("target_id", partnerId)
          .maybeSingle<{ type: string | null }>();

        if (cancelled) return;
        if (error) {
          console.warn("[Messages] block check error:", error);
          setIsBlocked(false);
          return;
        }
        setIsBlocked(data?.type === "block");
      } catch (e) {
        if (!cancelled) {
          console.warn("[Messages] block check exception:", e);
          setIsBlocked(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, partnerId]);

  // メッセージ読み込み + 既読化
  useEffect(() => {
    if (!threadId || !currentUserId) return;
    if (!isUuid(threadId)) return;

    if (isBlocked) {
      setMessages([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const stored = await getMessagesForThread(threadId);
        if (cancelled) return;

        setMessages(stored.map((m) => mapDbToUi(m, currentUserId)));

        await markThreadAsRead({ threadId, viewerId: currentUserId });
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("メッセージの読み込みに失敗しました。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [threadId, currentUserId, isBlocked]);

  // Realtime（DEBUG）
  useEffect(() => {
    if (!threadId || !currentUserId || isBlocked) return;
    if (!isUuid(threadId)) return;

    let cancelled = false;
    let refetchTimer: any = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // ★ ここを追加
      const { data, error } = await supabase.auth.getSession();
      console.log("[Realtime DEBUG] getSession:", {
        error: error?.message ?? null,
        hasSession: !!data.session,
        userId: data.session?.user?.id ?? null,
        tokenHead: data.session?.access_token?.slice(0, 20) ?? null,
        expiresAt: data.session?.expires_at ?? null,
      });

      // ★ ここも追加
      if (data.session?.access_token) {
        supabase.realtime.setAuth(data.session.access_token);
        console.log(
          "[Realtime DEBUG] setAuth called:",
          data.session.access_token.slice(0, 20)
        );
      } else {
        console.warn("[Realtime DEBUG] no access token for realtime");
      }

      if (cancelled) return;

      channel = supabase
        .channel(`dm_messages_debug_${threadId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "dm_messages",
          },
          (payload) => {
            console.log("[Messages] INSERT payload:", payload);
          }
        )
        .subscribe((status) => {
          console.log("[Messages] realtime subscribe status:", status);
        });
    })();

    return () => {
      cancelled = true;
      if (refetchTimer) clearTimeout(refetchTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [threadId, currentUserId, isBlocked]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    autosizeTextarea(el, 5);
  }, [text]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // ★ 重要：既存スレッド/メッセージがあるなら「返信」扱いにする
  const isReplyForPolicy = !!thread || messages.length > 0;
  const allowedByRole = canSendDm(currentRole, partnerRole, isReplyForPolicy);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !threadId || !currentUserId) return;
    if (!isUuid(threadId)) return;
    if (isBlocked) return;
    if (!partnerId) return;

    if (currentRole === "therapist" && isUnaffiliatedTherapist) {
      alert("現在、所属店舗が無いため、ご返信ができません。");
      return;
    }

    // ★ 修正：isReplyForPolicy を使う（相手未返信でも送れる）
    const allowed = canSendDm(currentRole, partnerRole, isReplyForPolicy);
    if (!allowed) {
      alert("この組み合わせではDMを送ることができません。");
      return;
    }

    setSending(true);
    try {
      const ok = await sendMessage({
        threadId,
        fromUserId: currentUserId,
        toUserId: partnerId as UserId,
        text: trimmed,
      });

      if (!ok) {
        alert("メッセージの送信に失敗しました。");
        return;
      }

      const stored = await getMessagesForThread(threadId);
      setMessages(stored.map((m) => mapDbToUi(m, currentUserId)));
      setText("");

      await markThreadAsRead({ threadId, viewerId: currentUserId });
    } catch (e) {
      console.error(e);
      alert("メッセージの送信に失敗しました。");
    } finally {
      setSending(false);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value);
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const inputDisabled =
    isBlocked ||
    !currentUserId ||
    !allowedByRole ||
    (currentRole === "therapist" && isUnaffiliatedTherapist) ||
    (currentRole === "therapist" && checkingStatus);

  return (
    <>
      <div className="app-shell">
        <AppHeader title={partnerName} subtitle={partnerHandle} />

        <main className="app-main chat-main">
          <div className="chat-inner">
            <div className="partner-badge">
              <div className="avatar-wrap avatar-wrap--lg">
                <Link
                  href={getProfileHref(partnerRole, partnerId as any)}
                  className="no-link-style"
                  aria-label={`${partnerName} のプロフィールを開く`}
                >
                  <AvatarCircle displayName={partnerName} src={partnerAvatarUrl} />
                </Link>
              </div>
              <div className="partner-badge-main">
                <div className="partner-badge-name">{partnerName}</div>
                <div className="partner-badge-sub">
                  {partnerHandle}
                  {partnerRole !== "guest" && partnerRole !== "user" && (
                    <span className="partner-badge-pill">
                      {partnerRole === "store" ? "店舗" : "セラピスト"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {loading && (
              <p className="text-meta" style={{ padding: "8px 2px" }}>
                読み込み中…
              </p>
            )}
            {error && !loading && (
              <p className="text-meta" style={{ padding: "8px 2px" }}>
                {error}
              </p>
            )}

            {!loading && !error && isBlocked && (
              <p className="text-meta" style={{ padding: "8px 2px" }}>
                この相手とのメッセージは、現在ブロック中のため閲覧・送信できません。
                ブロックの設定は相手のプロフィールから変更できます。
              </p>
            )}

            {!loading &&
              !error &&
              !isBlocked &&
              messages.map((m, i) => {
                const prev = messages[i - 1];
                const showDivider = !prev || prev.date !== m.date;

                return (
                  <React.Fragment key={m.id}>
                    {showDivider && <DateDivider date={m.date} />}

                    <div
                      className={
                        "chat-row " +
                        (m.from === "me" ? "chat-row--me" : "chat-row--partner")
                      }
                    >
                      {m.from === "partner" && (
                        <div className="avatar-wrap avatar-wrap--sm">
                          <Link
                            href={getProfileHref(partnerRole, partnerId as any)}
                            className="no-link-style"
                            aria-label={`${partnerName} のプロフィールを開く`}
                          >
                            <AvatarCircle
                              displayName={partnerName}
                              src={partnerAvatarUrl}
                            />
                          </Link>
                        </div>
                      )}

                      <div className="chat-bubble-wrap">
                        <div className="chat-bubble">{m.text}</div>
                        <div className="chat-meta">{m.time}</div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}

            <div ref={endRef} />
          </div>
        </main>

        {currentRole === "therapist" && isUnaffiliatedTherapist ? (
          <div className="chat-status-bar">
            <p className="chat-status-text">
              現在、所属店舗が無いため、ご返信ができません。
            </p>
          </div>
        ) : (
          <div className="chat-input-bar">
            <div className="chat-input-inner">
              <textarea
                ref={inputRef}
                className="chat-input"
                value={text}
                onChange={handleChange}
                placeholder={
                  isBlocked
                    ? "ブロック中のためメッセージを送信できません"
                    : checkingStatus && currentRole === "therapist"
                    ? "所属状態を確認しています…"
                    : "メッセージを入力..."
                  }
                rows={1}
                disabled={inputDisabled}
              />
             <button
                type="button"
                className="chat-send-btn"
                onClick={handleSend}
                disabled={inputDisabled || !text.trim() || sending}
              >
                送信
              </button>
            </div>
          </div>
        )}

        <BottomNav active="messages" hasUnread={hasUnread} />
      </div>

      <style jsx global>{`
        .chat-main {
          padding: 12px 12px 120px;
        }
        .chat-inner {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .avatar-wrap {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .avatar-wrap--lg {
          width: 44px;
          height: 44px;
        }
        .avatar-wrap--sm {
          width: 32px;
          height: 32px;
        }

        .partner-badge {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 10px;
          border-radius: 14px;
          background: var(--surface-soft);
          border: 1px solid var(--border);
          margin-bottom: 6px;
        }
        .partner-badge-main {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
          flex: 1;
        }
        .partner-badge-name {
          font-size: 13px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .partner-badge-sub {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: var(--text-sub);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .partner-badge-pill {
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-sub);
          font-weight: 700;
          flex-shrink: 0;
        }

        /* ★ 日付：小さく、薄いグレー、中央 */
        .date-divider {
          display: flex;
          justify-content: center;
          margin: 10px 0;
        }
        .date-divider span {
          padding: 3px 10px;
          border-radius: 999px;
          font-size: 10px;
          line-height: 1;
          background: rgba(0, 0, 0, 0.06);
          color: var(--text-sub); /* ←あなたのテーマに存在する変数 */
          letter-spacing: 0.02em;
        }

        .chat-row {
          display: flex;
          align-items: flex-end;
          gap: 8px;
        }
        .chat-row--partner {
          justify-content: flex-start;
        }
        .chat-row--me {
          justify-content: flex-end;
        }

        .chat-bubble-wrap {
          max-width: 75%;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .chat-bubble {
          border-radius: 14px;
          padding: 8px 11px;
          font-size: 14px;
          line-height: 1.6;
          word-break: break-word;
        }
        .chat-row--partner .chat-bubble {
          background: var(--surface);
          color: var(--text-main);
          border: 1px solid var(--border);
        }
        .chat-row--me .chat-bubble {
          background: var(--accent);
          color: #fff;
        }

        .chat-meta {
          font-size: 11px;
          color: var(--text-sub);
          margin-top: 2px;
          text-align: right;
        }

        .chat-input-bar {
          position: fixed;
          left: 50%;
          transform: translateX(-50%);
          bottom: 70px;
          width: 100%;
          max-width: 430px;
          padding: 6px 10px 10px;
          background: linear-gradient(
            to top,
            rgba(253, 251, 247, 0.96),
            rgba(253, 251, 247, 0.78),
            transparent
          );
          box-sizing: border-box;
          z-index: 40;
        }

        .chat-input-inner {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          border-radius: 20px;
          background: var(--surface);
          border: 1px solid var(--border);
          padding: 6px 8px 6px 12px;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.03);
        }

        .chat-input {
          flex: 1;
          border: none;
          background: transparent;
          resize: none;
          font-size: 13px;
          line-height: 1.4;
          padding: 7px 0 5px 12px; /* 上 右 下 左 */
          height: auto;          /* JSがheightを入れる前提 */
          overflow-y: hidden;    /* JSが必要ならautoに切替 */
          white-space: pre-wrap; /* 改行保持 */
        }

        .chat-input:focus {
          outline: none;
        }

        .chat-send-btn {
          border: none;
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          background: var(--accent);
          color: #fff;
          box-shadow: 0 2px 6px rgba(215, 185, 118, 0.45);
          flex-shrink: 0;
        }
        .chat-send-btn:disabled {
          opacity: 0.5;
          cursor: default;
          box-shadow: none;
        }

        .chat-status-bar {
          border-top: 1px solid var(--border);
          padding: 8px 12px;
          background: var(--surface);
        }
        .chat-status-text {
          font-size: 12px;
          color: var(--text-sub);
          text-align: center;
        }
      `}</style>
    </>
  );
};

export default MessageDetailPage;