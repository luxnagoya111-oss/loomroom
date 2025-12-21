// app/connections/[id]/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import AvatarCircle from "@/components/AvatarCircle";

import { supabase } from "@/lib/supabaseClient";
import { getCurrentUserId } from "@/lib/auth";
import { toPublicHandleFromUserId } from "@/lib/handle";

// ==============================
// util
// ==============================
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: string | null | undefined): v is string {
  return !!v && UUID_REGEX.test(v);
}

type TabKey = "followers" | "follows";

function normalizeTab(v: string | null): TabKey {
  if (v === "follows") return "follows";
  return "followers";
}

// ===== Avatar URL 正規化（既存方針と同じ）=====
const AVATAR_BUCKET = "avatars";

function normalizeAvatarUrl(v: any): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

function isProbablyHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function looksValidAvatarUrl(v: string | null | undefined): boolean {
  const s = (v ?? "").trim();
  if (!s) return false;
  if (s.includes("/storage/v1/object/public/avatars")) {
    if (/\/public\/avatars\/?$/i.test(s)) return false;
  }
  return true;
}

function resolveAvatarUrl(raw: string | null | undefined): string | null {
  const v = normalizeAvatarUrl(raw);
  if (!v) return null;
  if (isProbablyHttpUrl(v)) return v;

  const path = v.startsWith(`${AVATAR_BUCKET}/`)
    ? v.slice(AVATAR_BUCKET.length + 1)
    : v;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

// ==============================
// Types (Step 2-3でDBに接続)
// ==============================
type ConnectionUser = {
  userId: string; // users.id (uuid)
  role: "user" | "therapist" | "store";
  displayName: string;
  handle: string;
  intro: string; // 自己紹介（users.description / therapists.profile / stores.description などの統一表示）
  area?: string | null;
  avatar_url?: string | null; // raw
  // viewer目線での状態（Step 2-3で relations から埋める）
  isFollowing: boolean;
};

// 表示用：roleをラベル化
function roleLabel(role: ConnectionUser["role"]) {
  if (role === "store") return "店舗";
  if (role === "therapist") return "セラピスト";
  return "ユーザー";
}

// ==============================
// Row Component (X風)
// ==============================
function ConnectionRow(props: {
  item: ConnectionUser;
  onOpenProfile: (userId: string) => void;
  onToggleFollow: (userId: string) => void;
}) {
  const { item, onOpenProfile, onToggleFollow } = props;

  const avatarUrl = looksValidAvatarUrl(item.avatar_url)
    ? resolveAvatarUrl(item.avatar_url)
    : null;

  const rightLabel = item.isFollowing ? "フォロー中" : "フォロー";
  const rightClass = item.isFollowing ? "pill pill--on" : "pill pill--off";

  return (
    <div className="conn-row">
      <button
        className="row-hit"
        onClick={() => onOpenProfile(item.userId)}
        aria-label="プロフィールを開く"
      >
        {/* 左：アバター（2行相当） */}
        <div className="avatar-col">
          <AvatarCircle
            size={56}
            avatarUrl={avatarUrl}
            displayName={item.displayName}
            alt=""
          />
        </div>

        {/* 中央：名前/ハンドル/ロール + 自己紹介 */}
        <div className="mid-col">
          <div className="topline">
            <div className="name">{item.displayName}</div>
            <div className="meta">
              <span className="handle">{item.handle}</span>
              <span className="dot">·</span>
              <span className="role">{roleLabel(item.role)}</span>
            </div>
          </div>

          <div className="intro">
            {item.intro?.trim()?.length
              ? item.intro
              : "まだ自己紹介はありません。"}
          </div>
        </div>
      </button>

      {/* 右：ボタン（2行相当） */}
      <div className="right-col">
        <button
          className={rightClass}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFollow(item.userId);
          }}
          aria-label={rightLabel}
        >
          {rightLabel}
        </button>
      </div>

      <style jsx>{`
        .conn-row {
          display: flex;
          align-items: stretch;
          gap: 10px;
          padding: 12px 0;
          border-bottom: 1px solid rgba(148, 163, 184, 0.25);
        }

        .row-hit {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          flex: 1;
          min-width: 0;
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          text-align: left;
          color: inherit;
        }

        .avatar-col {
          width: 56px;
          flex-shrink: 0;
          display: flex;
          align-items: flex-start;
        }

        .mid-col {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding-top: 2px;
        }

        .topline {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .name {
          font-size: 14px;
          font-weight: 700;
          line-height: 1.25;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .meta {
          display: flex;
          align-items: baseline;
          gap: 6px;
          min-width: 0;
          color: var(--text-sub);
          font-size: 12px;
          line-height: 1.2;
        }

        .handle {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 50%;
        }

        .dot {
          opacity: 0.6;
        }

        .role {
          white-space: nowrap;
          opacity: 0.95;
        }

        .intro {
          font-size: 13px;
          line-height: 1.55;
          color: var(--text-main);
          display: -webkit-box;
          -webkit-line-clamp: 2; /* 2行 */
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .right-col {
          width: 92px; /* 2行相当の存在感 */
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }

        .pill {
          height: 34px;
          padding: 0 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          border: 1px solid var(--border);
          white-space: nowrap;
        }

        .pill--on {
          background: var(--surface);
          color: var(--text-main);
          border-color: rgba(148, 163, 184, 0.55);
        }

        .pill--off {
          background: var(--text-main);
          color: #fff;
          border-color: transparent;
        }
      `}</style>
    </div>
  );
}

// ==============================
// Page
// ==============================
const ConnectionsPage: React.FC = () => {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const targetUserId = params?.id;
  const initialTab: TabKey = normalizeTab(searchParams.get("tab"));

  // viewer
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [guestUserId, setGuestUserId] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // tab
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  // swipe container ref
  const pagerRef = useRef<HTMLDivElement | null>(null);

  // Step 2-3でDBに差し替え
  const [followers, setFollowers] = useState<ConnectionUser[]>([]);
  const [follows, setFollows] = useState<ConnectionUser[]>([]);

  // handle 表示用
  const isValidTarget = isUuid(targetUserId);
  const targetHandle = useMemo(() => {
    if (!isValidTarget) return "@user";
    return toPublicHandleFromUserId(targetUserId) ?? "@user";
  }, [isValidTarget, targetUserId]);

  // ------------------------------
  // auth check
  // ------------------------------
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        setGuestUserId(getCurrentUserId());
        const { data } = await supabase.auth.getUser();
        if (!cancelled) setAuthUserId(data.user?.id ?? null);
      } catch {
        if (!cancelled) setAuthUserId(null);
      } finally {
        if (!cancelled) setCheckingAuth(false);
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  // ------------------------------
  // A方針：ログイン必須
  // ------------------------------
  const isLoggedIn = !!authUserId;

  // ------------------------------
  // Step 2-2: dummy data（見た目確認）
  // ------------------------------
  useEffect(() => {
    if (!isValidTarget) return;
    // 本番はStep 2-3で差し替え
    const mk = (n: number, role: ConnectionUser["role"], following: boolean) => {
      const uid = "00000000-0000-0000-0000-00000000000" + n; // ダミー
      return {
        userId: uid,
        role,
        displayName:
          role === "therapist" ? `田中 はる ${n}` : role === "store" ? `店舗 ${n}` : `ユーザー ${n}`,
        handle: "@tanaka_haru",
        intro:
          "穏やかな時間を大切にしています。無理のないペースで、ゆっくり整えていけたら嬉しいです。",
        area: "中部",
        avatar_url: null,
        isFollowing: following,
      } satisfies ConnectionUser;
    };

    setFollowers([
      mk(1, "therapist", true),
      mk(2, "user", false),
      mk(3, "store", false),
      mk(4, "therapist", true),
    ]);

    setFollows([
      mk(5, "therapist", true),
      mk(6, "store", true),
      mk(7, "user", true),
    ]);
  }, [isValidTarget]);

  // ------------------------------
  // URL <-> UI 同期
  // ------------------------------
  useEffect(() => {
    // URLのtab変更に追従（ブラウザ戻る等）
    const t = normalizeTab(searchParams.get("tab"));
    setActiveTab(t);
  }, [searchParams]);

  // activeTab が変わったら pager を該当ページへスナップ
  useEffect(() => {
    const el = pagerRef.current;
    if (!el) return;

    const width = el.clientWidth;
    const x = activeTab === "followers" ? 0 : width;

    el.scrollTo({ left: x, behavior: "smooth" });
  }, [activeTab]);

  // スワイプ（スクロール）でタブを更新し、URLも同期
  useEffect(() => {
    const el = pagerRef.current;
    if (!el) return;

    let raf = 0;

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const width = el.clientWidth || 1;
        const idx = Math.round(el.scrollLeft / width);
        const next: TabKey = idx <= 0 ? "followers" : "follows";

        // state更新
        setActiveTab((prev) => (prev === next ? prev : next));

        // URL更新（replace）
        if (isValidTarget) {
          router.replace(`/connections/${targetUserId}?tab=${next}`);
        }
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll as any);
    };
  }, [router, isValidTarget, targetUserId]);

  // ------------------------------
  // Handlers
  // ------------------------------
  const openProfile = (userId: string) => {
    // プロフィールは users.id 基準（/mypage/[uuid]）
    router.push(`/mypage/${userId}`);
  };

  const toggleFollowLocalPreview = (tab: TabKey, userId: string) => {
    // Step 2-2段階：UIの動作確認だけ
    if (tab === "followers") {
      setFollowers((prev) =>
        prev.map((x) =>
          x.userId === userId ? { ...x, isFollowing: !x.isFollowing } : x
        )
      );
    } else {
      setFollows((prev) =>
        prev.map((x) =>
          x.userId === userId ? { ...x, isFollowing: !x.isFollowing } : x
        )
      );
    }
  };

  // ------------------------------
  // Guards render
  // ------------------------------
  if (!isValidTarget) {
    return (
      <div className="app-shell">
        <AppHeader title="つながり" showBack />
        <main className="app-main">
          <p className="empty-hint">このページは表示できません。</p>
        </main>
        <BottomNav />
      </div>
    );
  }

  if (checkingAuth) {
    return (
      <div className="app-shell">
        <AppHeader title="つながり" showBack />
        <main className="app-main">
          <p className="empty-hint">確認しています…</p>
        </main>
        <BottomNav />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="app-shell">
        <AppHeader title="つながり" showBack />
        <main className="app-main">
          <div className="empty-hint" style={{ marginTop: 24 }}>
            この一覧を見るにはログインが必要です。
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="primary-btn" onClick={() => router.push("/login")}>
              ログインする
            </button>
          </div>
        </main>
        <BottomNav />
        <style jsx>{`
          .primary-btn {
            padding: 8px 14px;
            font-size: 13px;
            border-radius: 8px;
            border: none;
            background: var(--accent);
            color: #fff;
            cursor: pointer;
          }
          .empty-hint {
            font-size: 13px;
            color: var(--text-sub);
            line-height: 1.6;
          }
        `}</style>
      </div>
    );
  }

  // ==============================
  // main render
  // ==============================
  const followersCount = followers.length;
  const followsCount = follows.length;

  return (
    <div className="app-shell">
      <AppHeader title="つながり" subtitle={targetHandle} showBack />

      <main className="app-main connections-main">
        {/* X風：上部タブ（下にインジケータ） */}
        <div className="tabs">
          <button
            className={`tab ${activeTab === "followers" ? "active" : ""}`}
            onClick={() => router.replace(`/connections/${targetUserId}?tab=followers`)}
          >
            フォロワー
            <span className="count">{followersCount}</span>
          </button>

          <button
            className={`tab ${activeTab === "follows" ? "active" : ""}`}
            onClick={() => router.replace(`/connections/${targetUserId}?tab=follows`)}
          >
            フォロー中
            <span className="count">{followsCount}</span>
          </button>
        </div>

        {/* Swipe pager */}
        <div className="pager" ref={pagerRef}>
          {/* followers */}
          <section className="page">
            {followers.length === 0 ? (
              <div className="empty">フォロワーはまだいません。</div>
            ) : (
              <div className="list">
                {followers.map((u) => (
                  <ConnectionRow
                    key={`followers:${u.userId}`}
                    item={u}
                    onOpenProfile={openProfile}
                    onToggleFollow={(uid) => toggleFollowLocalPreview("followers", uid)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* follows */}
          <section className="page">
            {follows.length === 0 ? (
              <div className="empty">フォロー中はまだありません。</div>
            ) : (
              <div className="list">
                {follows.map((u) => (
                  <ConnectionRow
                    key={`follows:${u.userId}`}
                    item={u}
                    onOpenProfile={openProfile}
                    onToggleFollow={(uid) => toggleFollowLocalPreview("follows", uid)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <BottomNav />
      <style jsx>{`
        .connections-main {
          padding: 0 16px 120px;
        }

        .tabs {
          position: sticky;
          top: 0;
          z-index: 3;
          display: flex;
          background: var(--surface, #fff);
          border-bottom: 1px solid rgba(148, 163, 184, 0.25);
        }

        .tab {
          flex: 1;
          padding: 12px 0 10px;
          border: none;
          background: none;
          cursor: pointer;
          color: var(--text-sub);
          font-size: 13px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          position: relative;
        }

        .tab .count {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-sub);
          opacity: 0.9;
        }

        .tab.active {
          color: var(--text-main);
        }

        .tab.active .count {
          color: var(--text-main);
          opacity: 0.95;
        }

        .tab.active::after {
          content: "";
          position: absolute;
          left: 18%;
          right: 18%;
          bottom: -1px;
          height: 3px;
          border-radius: 999px;
          background: var(--text-main);
        }

        /* pager (X風スワイプ) */
        .pager {
          display: flex;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .pager::-webkit-scrollbar {
          display: none;
        }

        .page {
          min-width: 100%;
          scroll-snap-align: start;
          padding-top: 6px;
        }

        .list {
          display: flex;
          flex-direction: column;
        }

        .empty {
          padding: 18px 0;
          font-size: 13px;
          color: var(--text-sub);
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
};

export default ConnectionsPage;