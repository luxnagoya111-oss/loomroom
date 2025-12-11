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

import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";

import { getCurrentUserId, getCurrentUserRole } from "@/lib/auth";
import { getRelationFlags } from "@/lib/relationStorage";
import {
  getThreadById,
  getMessagesForThread,
  sendMessage,
  markThreadAsRead,
} from "@/lib/repositories/dmRepository";
import { canSendDm } from "@/lib/dmPolicy";
import { supabase } from "@/lib/supabaseClient";

import type { UserId, Role } from "@/types/user";
import { inferRoleFromId } from "@/types/user";
import type { ThreadId } from "@/types/dm";
import type { DbDmMessageRow, DbDmThreadRow } from "@/types/db";

const hasUnread = false;

type Message = {
  id: string;
  from: "me" | "partner";
  text: string;
  time: string; // HH:MM
  date: string; // YYYY.MM.DD
};

// therapists テーブルのステータス確認用（最小限）
type DbTherapistRowForStatus = {
  id: string;
  user_id: string;
  store_id: string | null;
};

// ==============================
// Utility
// ==============================
function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function formatDateString(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  // YYYY.MM.DD 形式
  return `${y}.${m}.${d}`;
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

// ==============================
// Components
// ==============================
function ChatAvatar({ side }: { side: "me" | "partner" }) {
  const content = side === "partner" ? "🦋" : "U";
  return (
    <div className={`avatar-circle chat-avatar chat-avatar--${side}`}>
      <span className="avatar-circle-text">{content}</span>
    </div>
  );
}

// LINE風の小さい日付チップ
function DateDivider({ date }: { date: string }) {
  return (
    <div className="date-divider">
      <span>{date}</span>
    </div>
  );
}

// ==============================
// Page
// ==============================
const MessageDetailPage: React.FC = () => {
  const params = useParams();
  const rawId = (params?.id as string) || "";
  const threadId = rawId as ThreadId; // URL = dm_threads.thread_id

  // SSRズレ防止：currentUserId / Role は state で管理
  const [currentUserId, setCurrentUserId] = useState<UserId>("" as UserId);
  const [currentRole, setCurrentRole] = useState<Role>("guest");

  // 「無所属セラピストかどうか」を Supabase から判定
  const [isUnaffiliatedTherapist, setIsUnaffiliatedTherapist] =
    useState<boolean>(false);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(false);

  const [thread, setThread] = useState<DbDmThreadRow | null>(null);
  const [partnerId, setPartnerId] = useState<string>("");

  // ヘッダーに表示する相手名とID（@xxx）
  const [partnerName, setPartnerName] = useState<string>("メッセージ相手");
  const [partnerHandle, setPartnerHandle] = useState<string>("");

  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isBlocked, setIsBlocked] = useState(false);

  const endRef = useRef<HTMLDivElement | null>(null);

  // ==============================
  // currentUserId / Role をクライアントで決定
  // ==============================
  useEffect(() => {
    const id = getCurrentUserId();
    setCurrentUserId(id as UserId);

    const role = getCurrentUserRole();
    setCurrentRole(role);
  }, []);

  // ==============================
  // 「無所属セラピストかどうか」を Supabase から確認
  // ==============================
  useEffect(() => {
    if (!currentUserId || currentRole !== "therapist") {
      setIsUnaffiliatedTherapist(false);
      setCheckingStatus(false);
      return;
    }

    let cancelled = false;

    const checkTherapistStatus = async () => {
      try {
        setCheckingStatus(true);

        const { data, error } = await supabase
          .from("therapists")
          .select("id, user_id, store_id")
          .eq("user_id", currentUserId)
          .maybeSingle<DbTherapistRowForStatus>();

        if (cancelled) return;

        if (error) {
          console.error("[Messages] therapist status load error:", error);
          // 安全側に倒して「無所属扱い」とする
          setIsUnaffiliatedTherapist(true);
          return;
        }

        if (!data) {
          // therapist レコードがない → 無所属扱い
          setIsUnaffiliatedTherapist(true);
          return;
        }

        // store_id が NULL なら無所属
        setIsUnaffiliatedTherapist(!data.store_id);
      } catch (e) {
        if (!cancelled) {
          console.error("[Messages] therapist status check exception:", e);
          setIsUnaffiliatedTherapist(true);
        }
      } finally {
        if (!cancelled) {
          setCheckingStatus(false);
        }
      }
    };

    checkTherapistStatus();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, currentRole]);

  // ==============================
  // threadId から Supabase のスレッド情報を取得し、partnerId を決める
  // ==============================
  useEffect(() => {
    if (!threadId || !currentUserId) return;

    let cancelled = false;

    (async () => {
      try {
        const th = await getThreadById(threadId);
        if (cancelled) return;
        setThread(th);

        if (th) {
          const other =
            th.user_a_id === currentUserId ? th.user_b_id : th.user_a_id;
          setPartnerId(other ?? "");
          setPartnerHandle(other ? `@${other}` : "");
        } else {
          // スレッドが存在しない場合 (将来: 新規スレッド作成導線で調整)
          setPartnerId("");
          setPartnerHandle("");
        }
      } catch (e) {
        console.error("Failed to load dm thread:", e);
        if (!cancelled) {
          setThread(null);
          setPartnerId("");
          setPartnerHandle("");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [threadId, currentUserId]);

  // ==============================
  // 相手との関係（ブロック状態）を確認（ローカル版）
  // ==============================
  useEffect(() => {
    if (!currentUserId || !partnerId) {
      setIsBlocked(false);
      return;
    }
    try {
      const flags = getRelationFlags(currentUserId, partnerId as UserId);
      setIsBlocked(flags.blocked);
    } catch (e) {
      console.warn("Failed to get relation flags", e);
      setIsBlocked(false);
    }
  }, [currentUserId, partnerId]);

  // ==============================
  // 相手の表示名／ハンドルを解決（localStorage ベースの仮仕様）
  // ==============================
  useEffect(() => {
    if (!partnerId) return;

    let handle = `@${partnerId}`;
    let name = "";

    try {
      if (typeof window !== "undefined") {
        // 1) セラピストプロフ（displayName）
        const thRaw = window.localStorage.getItem(
          `loomroom_therapist_profile_${partnerId}`
        );
        if (thRaw) {
          const th = JSON.parse(thRaw) as { displayName?: string };
          if (th.displayName && th.displayName.trim().length > 0) {
            name = th.displayName.trim();
          }
        }

        // 2) 店舗プロフ
        if (!name) {
          const storeRaw = window.localStorage.getItem(
            `loomroom_store_profile_${partnerId}`
          );
          if (storeRaw) {
            if (partnerId === "lux") {
              name = "LuX nagoya";
              handle = "@lux";
            } else if (partnerId === "loomroom") {
              name = "LoomRoom";
              handle = "@loomroom";
            } else {
              name = "LoomRoom 提携サロン";
            }
          }
        }

        // 3) ユーザープロフ（nickname）
        if (!name) {
          const userRaw = window.localStorage.getItem(
            `loomroom_profile_v1_${partnerId}`
          );
          if (userRaw) {
            const user = JSON.parse(userRaw) as { nickname?: string };
            if (user.nickname && user.nickname.trim().length > 0) {
              name = user.nickname.trim();
            }
          }
        }
      }

      // 4) デモ用の特別扱い
      if (!name) {
        if (partnerId === "taki") {
          name = "TAKI";
          handle = "@taki_lux";
        } else if (partnerId === "loomroom") {
          name = "LoomRoom nagoya";
          handle = "@loomroom_app";
        } else {
          name = "メッセージ相手";
        }
      }

      setPartnerName(name);
      setPartnerHandle(handle);
    } catch (e) {
      console.warn("Failed to resolve partner for thread", threadId, e);
      setPartnerName("メッセージ相手");
      setPartnerHandle(partnerId ? `@${partnerId}` : "");
    }
  }, [threadId, partnerId]);

  // ==============================
  // メッセージ読み込み ＋ 既読化
  // ==============================
  useEffect(() => {
    if (!threadId || !currentUserId) return;

    // ブロック中は会話履歴を出さない（システムメッセージのみ）
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

        // 自分側の未読を0にする
        await markThreadAsRead({
          threadId,
          viewerId: currentUserId,
        });
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError("メッセージの読み込みに失敗しました。");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [threadId, currentUserId, isBlocked]);

  // ==============================
  // Realtime 購読（dm_messages / dm_threads）
  // ==============================
  useEffect(() => {
    // ID 未確定 or ブロック中は購読しない
    if (!threadId || !currentUserId || isBlocked) return;

    // ---- dm_messages: INSERT（新着メッセージ） ----
    const channelMessages = supabase
      .channel(`dm_messages_${threadId}_${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dm_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const row = payload.new as DbDmMessageRow;

          setMessages((prev) => {
            // すでに存在するIDならスキップ（重複防止）
            if (prev.some((m) => m.id === row.id)) return prev;
            const ui = mapDbToUi(row, currentUserId);
            return [...prev, ui];
          });
        }
      )
      .subscribe();

    // ---- dm_threads: UPDATE（last_message / unread など）----
    const channelThreads = supabase
      .channel(`dm_threads_${threadId}_${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dm_threads",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const updated = payload.new as DbDmThreadRow;
          setThread(updated);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channelMessages);
      supabase.removeChannel(channelThreads);
    };
  }, [threadId, currentUserId, isBlocked]);

  // 自動スクロール
  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !threadId || !currentUserId) return;
    if (isBlocked) return; // ブロック中は送信不可
    if (!partnerId) return;

    // 無所属セラピストは返信不可（念のためここでもガード）
    if (currentRole === "therapist" && isUnaffiliatedTherapist) {
      alert("現在、所属店舗が無いため、ご返信ができません。");
      return;
    }

    const partnerRole: Role = inferRoleFromId(partnerId as UserId);
    const isReply = messages.some((m) => m.from === "partner");
    const allowedByRole = canSendDm(currentRole, partnerRole, isReply);

    if (!allowedByRole) {
      alert("この組み合わせでは新しくDMを送ることができません。");
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

      // 再取得（Realtime と二重になるが、IDチェックで重複は防ぐ）
      const stored = await getMessagesForThread(threadId);
      setMessages(stored.map((m) => mapDbToUi(m, currentUserId)));
      setText("");

      // 自分視点の未読を0にしておく
      await markThreadAsRead({
        threadId,
        viewerId: currentUserId,
      });
    } catch (e) {
      console.error(e);
      alert("メッセージの送信に失敗しました。");
    } finally {
      setSending(false);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) =>
    setText(e.target.value);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ロール・ポリシーに基づく DM 可否判定
  const partnerRole: Role = inferRoleFromId(partnerId as UserId);
  const isReply = messages.some((m) => m.from === "partner");
  const allowedByRole = canSendDm(currentRole, partnerRole, isReply);

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
                        (m.from === "me"
                          ? "chat-row--me"
                          : "chat-row--partner")
                      }
                    >
                      {m.from === "partner" && <ChatAvatar side="partner" />}

                      <div className="chat-bubble-wrap">
                        <div className="chat-bubble">{m.text}</div>
                        <div className="chat-meta">{m.time}</div>
                      </div>

                      {m.from === "me" && <ChatAvatar side="me" />}
                    </div>
                  </React.Fragment>
                );
              })}

            <div ref={endRef} />
          </div>
        </main>

        {/* 入力バー or 無所属セラピストメッセージ */}
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
                className="chat-input"
                value={text}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  isBlocked
                    ? "ブロック中のためメッセージを送信できません"
                    : checkingStatus && currentRole === "therapist"
                    ? "所属状態を確認しています…"
                    : "メッセージを入力（Enterで送信／改行はShift＋Enter）"
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

      <style jsx>{`
        .chat-main {
          padding: 12px 12px 120px;
        }

        .chat-inner {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        /* LINE風・小さい日付チップ */
        .date-divider {
          display: flex;
          justify-content: center;
          margin: 14px 0;
        }

        .date-divider span {
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          line-height: 1;
          background: rgba(0, 0, 0, 0.08);
          color: var(--text-sub);
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

        .chat-avatar {
          width: 32px;
          height: 32px;
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
          bottom: 58px;
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
          border-radius: 999px;
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
          max-height: 80px;
          padding: 2px 0;
        }

        .chat-input:focus {
          outline: none;
        }

        .chat-send-btn {
          border: none;
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 13px;
          font-weight: 600;
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
          color: var(--muted-foreground);
          text-align: center;
        }
      `}</style>
    </>
  );
};

export default MessageDetailPage;