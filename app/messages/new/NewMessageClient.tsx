// app/messages/new/NewMessageClient.tsx
"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  KeyboardEvent,
  ChangeEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import AvatarCircle from "@/components/AvatarCircle";

import { supabase } from "@/lib/supabaseClient";
import { getCurrentUserRole } from "@/lib/auth";
import { canSendDm } from "@/lib/dmPolicy";

import type { Role, UserId } from "@/types/user";

const hasUnread = false;

// uuid 判定
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

function safeText(v: any): string {
  return typeof v === "string" ? v.trim() : String(v ?? "").trim();
}

function normalizeRole(raw: string | null | undefined): Role {
  const v = (raw ?? "").toString();
  if (v === "store" || v === "therapist" || v === "user") return v;
  return "guest";
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
 * ★ SearchPage踏襲：avatar URL 解決（storage path / http 両対応）
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

function autosizeTextarea(el: HTMLTextAreaElement) {
  el.style.height = "0px";
  el.style.height = `${el.scrollHeight}px`;
  el.style.overflowY = "hidden";
}

type DbUserMini = {
  id: string;
  name: string | null;
  role: string | null;
  avatar_url: string | null;
};

type DbTherapistMini = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type DbStoreMini = {
  owner_user_id: string | null;
  name: string | null;
  avatar_url: string | null;
};

export default function NewMessageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ?to=<targetUserId>
  const targetUserId = useMemo(() => {
    return (searchParams.get("to") ?? "").trim();
  }, [searchParams]);

  // viewer（Auth uuid を正）
  const [authChecked, setAuthChecked] = useState(false);
  const [viewerId, setViewerId] = useState<UserId>("" as UserId);
  const [viewerRole, setViewerRole] = useState<Role>("guest");

  // partner display
  const [partnerName, setPartnerName] = useState<string>("メッセージ相手");
  const [partnerHandle, setPartnerHandle] = useState<string>("");
  const [partnerRole, setPartnerRole] = useState<Role>("guest");
  const [partnerAvatarUrl, setPartnerAvatarUrl] = useState<string | null>(null);

  // therapist status (viewer)
  const [isUnaffiliatedTherapist, setIsUnaffiliatedTherapist] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);

  // block
  const [isBlocked, setIsBlocked] = useState(false);

  // input
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // 1) 宛先(to)チェック
  useEffect(() => {
    if (!targetUserId) {
      setPageError("宛先がありません。");
      return;
    }
    if (!isUuid(targetUserId)) {
      setPageError("宛先が不正です。");
      return;
    }
    setPageError(null);
  }, [targetUserId]);

  // 2) ログイン判定（Auth user を正） + viewerRole を DB から解決
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!isUuid(targetUserId)) return;

        const { data } = await supabase.auth.getUser();
        const uid = data.user?.id ?? null;

        if (cancelled) return;

        if (!isUuid(uid)) {
          const next = `/messages/new?to=${encodeURIComponent(targetUserId)}`;
          router.replace(`/login?next=${encodeURIComponent(next)}`);
          return;
        }

        setViewerId(uid as UserId);

        // role は DB(users.role) を正にする（取れなければ local fallback）
        let role: Role = getCurrentUserRole();
        const { data: u, error: uErr } = await supabase
          .from("users")
          .select("role")
          .eq("id", uid)
          .maybeSingle<{ role: string | null }>();

        if (!uErr) {
          const dbRole = normalizeRole(u?.role);
          if (dbRole !== "guest") role = dbRole;
        }

        setViewerRole(role);
      } catch {
        if (!isUuid(targetUserId)) return;
        const next = `/messages/new?to=${encodeURIComponent(targetUserId)}`;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, targetUserId]);

  // ★ Realtime auth（このページ自体は購読しないが、遷移後の /messages/[id] で安定させるため同期）
  useEffect(() => {
    if (!authChecked) return;
    if (!isUuid(viewerId)) return;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!cancelled && token) {
          supabase.realtime.setAuth(token);
        }
      } catch (e) {
        console.warn("[MessagesNew] realtime setAuth failed:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authChecked, viewerId]);

  // 3) 相手表示情報を DB から解決（users.role を正）
  useEffect(() => {
    if (!isUuid(targetUserId)) return;

    let cancelled = false;

    (async () => {
      try {
        const { data: u, error: uErr } = await supabase
          .from("users")
          .select("id, name, role, avatar_url")
          .eq("id", targetUserId)
          .maybeSingle<DbUserMini>();

        if (cancelled) return;

        if (uErr) console.warn("[MessagesNew] partner users fetch error:", uErr);

        const resolvedRole = normalizeRole(u?.role);
        setPartnerRole(resolvedRole);

        // ★ 一覧/詳細と統一：@xxxxxx（相手ID短縮）
        setPartnerHandle(`@${toShortId(targetUserId) || "------"}`);

        let resolvedName =
          u?.name && u.name.trim().length > 0 ? u.name.trim() : "メッセージ相手";

        // avatar: users.avatar_url を最優先（resolveAvatarUrl必須）
        let resolvedAvatar: string | null = resolveAvatarUrl(u?.avatar_url);

        // therapist fallback
        if (resolvedRole === "therapist") {
          const { data: th, error: thErr } = await supabase
            .from("therapists")
            .select("user_id, display_name, avatar_url")
            .eq("user_id", targetUserId)
            .maybeSingle<DbTherapistMini>();

          if (!cancelled) {
            if (thErr)
              console.warn("[MessagesNew] partner therapist fetch error:", thErr);
            if (th) {
              if (th.display_name?.trim()) resolvedName = th.display_name.trim();
              if (!resolvedAvatar) resolvedAvatar = resolveAvatarUrl(th.avatar_url);
            }
          }
        }

        // store fallback (owner_user_id で引く)
        if (resolvedRole === "store") {
          const { data: st, error: stErr } = await supabase
            .from("stores")
            .select("owner_user_id, name, avatar_url")
            .eq("owner_user_id", targetUserId)
            .maybeSingle<DbStoreMini>();

          if (!cancelled) {
            if (stErr) console.warn("[MessagesNew] partner store fetch error:", stErr);
            if (st) {
              if (st.name?.trim()) resolvedName = st.name.trim();
              const stAv = resolveAvatarUrl(st.avatar_url);
              if (stAv) resolvedAvatar = stAv;
            }
          }
        }

        if (cancelled) return;

        setPartnerName(resolvedName);
        setPartnerAvatarUrl(resolvedAvatar);
      } catch (e) {
        if (cancelled) return;
        console.warn("[MessagesNew] resolve partner failed:", e);
        setPartnerName("メッセージ相手");
        setPartnerHandle(isUuid(targetUserId) ? `@${toShortId(targetUserId)}` : "");
        setPartnerRole("guest");
        setPartnerAvatarUrl(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [targetUserId]);

  // 4) 無所属セラピスト判定（viewer が therapist の場合）
  useEffect(() => {
    if (!viewerId || viewerRole !== "therapist" || !isUuid(viewerId)) {
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
          .select("user_id, store_id")
          .eq("user_id", viewerId)
          .maybeSingle<{ user_id: string; store_id: string | null }>();

        if (cancelled) return;

        if (error || !data) {
          setIsUnaffiliatedTherapist(true);
          return;
        }

        setIsUnaffiliatedTherapist(!data.store_id);
      } catch {
        if (!cancelled) setIsUnaffiliatedTherapist(true);
      } finally {
        if (!cancelled) setCheckingStatus(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewerId, viewerRole]);

  // 5) ブロック判定（uuid会員のみ）
  useEffect(() => {
    if (!viewerId || !isUuid(viewerId) || !isUuid(targetUserId)) {
      setIsBlocked(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("relations")
          .select("type")
          .eq("user_id", viewerId)
          .eq("target_id", targetUserId)
          .maybeSingle<{ type: string | null }>();

        if (cancelled) return;

        if (error) {
          console.warn("[MessagesNew] block check error:", error);
          setIsBlocked(false);
          return;
        }

        setIsBlocked(data?.type === "block");
      } catch (e) {
        if (!cancelled) {
          console.warn("[MessagesNew] block check exception:", e);
          setIsBlocked(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewerId, targetUserId]);

  // 6) 初回スクロール
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  // textarea autosize
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    autosizeTextarea(el);
  }, [text]);

  // 送信（ここで初回 thread が作成される）
  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    if (!isUuid(targetUserId)) return;
    if (!viewerId || !isUuid(viewerId)) return;

    if (isBlocked) return;

    if (viewerRole === "therapist" && isUnaffiliatedTherapist) {
      alert("現在、所属店舗が無いため、ご返信ができません。");
      return;
    }

    // new は “新規送信”扱い（isReply=false）
    const allowedByRole = canSendDm(viewerRole, partnerRole, false);
    if (!allowedByRole) {
      alert("この組み合わせでは新しくDMを送ることができません。");
      return;
    }

    setSending(true);
    setPageError(null);

    try {
      /**
       * ここはあなたのDB/RPC仕様に合わせる必要がある。
       * 現状コードは「p_target_user_id, p_text」を受けて thread_id を返すRPCを呼ぶ前提。
       * もし別名なら、ここだけ合わせる。
       */
      const { data, error } = await supabase.rpc("dm_send_message", {
        p_target_user_id: targetUserId,
        p_text: trimmed,
      });

      if (error) throw error;

      const threadId = String(data ?? "").trim();
      if (!isUuid(threadId)) throw new Error("thread_id が取得できませんでした");

      setText("");
      router.replace(`/messages/${threadId}`);
    } catch (e: any) {
      console.error(e);
      setPageError(e?.message ?? "メッセージの送信に失敗しました。");
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

  const showAuthLoading = !authChecked && !pageError;
  const allowedByRole = canSendDm(viewerRole, partnerRole, false);

  const inputDisabled =
    !!pageError ||
    showAuthLoading ||
    sending ||
    isBlocked ||
    !viewerId ||
    !allowedByRole ||
    (viewerRole === "therapist" && isUnaffiliatedTherapist) ||
    (viewerRole === "therapist" && checkingStatus);

  return (
    <>
      <div className="app-shell">
        <AppHeader title={partnerName} subtitle={partnerHandle} />

        <main className="app-main chat-main">
          <div className="chat-inner">
            <div className="partner-badge">
              <div className="avatar-wrap avatar-wrap--lg">
                <AvatarCircle
                  displayName={partnerName}
                  avatarUrl={partnerAvatarUrl}
                />
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

            {showAuthLoading && (
              <p className="text-meta" style={{ padding: "8px 2px" }}>
                確認中…
              </p>
            )}

            {!showAuthLoading && !pageError && isBlocked && (
              <p className="text-meta" style={{ padding: "8px 2px" }}>
                この相手は現在ブロック中のため、送信できません。
                ブロック設定は相手のプロフィールから変更できます。
              </p>
            )}

            {!showAuthLoading && !pageError && !isBlocked && (
              <p className="text-meta" style={{ padding: "8px 2px" }}>
                最初の送信時にスレッドが作成されます。
              </p>
            )}

            {pageError && (
              <p className="text-meta" style={{ padding: "8px 2px" }}>
                {pageError}
              </p>
            )}

            <div ref={endRef} />
          </div>
        </main>

        {viewerRole === "therapist" && isUnaffiliatedTherapist ? (
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
                onKeyDown={handleKeyDown}
                placeholder={
                  isBlocked
                    ? "ブロック中のためメッセージを送信できません"
                    : checkingStatus && viewerRole === "therapist"
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
                disabled={inputDisabled || !text.trim()}
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
          padding: 7px 0 5px 12px;
          height: auto;
          overflow-y: hidden;
          white-space: pre-wrap;
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
}