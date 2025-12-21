// app/connections/[id]/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import AvatarCircle from "@/components/AvatarCircle";
import { RelationActions } from "@/components/RelationActions";

import { supabase } from "@/lib/supabaseClient";
import { getCurrentUserId } from "@/lib/auth";
import { toPublicHandleFromUserId } from "@/lib/handle";
import {
  setRelation as setRelationOnServer,
  type RelationFlags,
} from "@/lib/repositories/relationRepository";
import type { UserId } from "@/types/user";

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

// ===== Avatar URL 正規化（mypageと同じ方針）=====
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

function normalizeFreeText(v: any): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s;
}

// ==============================
// Types
// ==============================
type ConnectionUser = {
  userId: string; // users.id (uuid)
  role: "user" | "therapist" | "store";
  displayName: string;
  handle: string;
  intro: string;
  area?: string | null;
  avatar_url?: string | null; // raw
  isFollowing: boolean; // viewer -> item
  followedAt?: string | null; // 並び順の根拠（relations.created_at）
};

type DbUserRow = {
  id: string;
  name: string | null;
  role: "user" | "therapist" | "store" | null;
  avatar_url: string | null;
  area: string | null;
  description: string | null;
};

type DbTherapistRow = {
  id: string;
  user_id: string;
  display_name: string | null;
  area: string | null;
  profile: string | null;
};

type DbStoreRow = {
  id: string;
  owner_user_id: string;
  name: string | null;
  area: string | null;
  description: string | null;
};

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
  onToggleFollow: (userId: string, nextEnabled: boolean) => void;
}) {
  const { item, onOpenProfile, onToggleFollow } = props;

  const avatarUrl = looksValidAvatarUrl(item.avatar_url)
    ? resolveAvatarUrl(item.avatar_url)
    : null;

  const flags: RelationFlags = {
    following: !!item.isFollowing,
    muted: false,
    blocked: false,
  };

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
            {item.intro?.trim()?.length ? item.intro : "まだ自己紹介はありません。"}
          </div>
        </div>
      </button>

      {/* 右：フォローボタン（RelationActionsを流用して色/挙動統一） */}
      <div className="right-col">
        <div className="follow-compact">
          <RelationActions
            flags={flags}
            onToggleFollow={() => onToggleFollow(item.userId, !item.isFollowing)}
            onToggleMute={() => {}}
            onToggleBlock={() => {}}
          />
        </div>
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
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .right-col {
          width: 110px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }

        /* RelationActions を「フォローボタンだけ」に見せる（色は既存のまま） */
        .follow-compact :global(.relation-more) {
          display: none !important;
        }
        .follow-compact :global(.relation-main-actions) {
          width: 100%;
          display: flex;
          justify-content: flex-end;
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

  const targetUserId = params?.id ?? null;
  const isValidTarget = isUuid(targetUserId);

  // viewer
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [guestUserId, setGuestUserId] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // tab
  const initialTab: TabKey = normalizeTab(searchParams.get("tab"));
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  // swipe container ref
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef(false);

  // lists
  const [followers, setFollowers] = useState<ConnectionUser[]>([]);
  const [follows, setFollows] = useState<ConnectionUser[]>([]);
  const [loadingFollowers, setLoadingFollowers] = useState(false);
  const [loadingFollows, setLoadingFollows] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // handle 表示用
  const targetHandle = useMemo(() => {
    if (!isValidTarget || !targetUserId) return "@user";
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
  // URL -> state 同期（戻る/直打ち）
  // ------------------------------
  useEffect(() => {
    const t = normalizeTab(searchParams.get("tab"));
    setActiveTab(t);
  }, [searchParams]);

  // ------------------------------
  // 初期タブの「表示ページ」と activeTab を確実に一致させる
  // （ここが今回の “入った直後は表示されない→スワイプで出る” の核心）
  // ------------------------------
  useEffect(() => {
    const el = pagerRef.current;
    if (!el) return;

    let raf = 0;
    let tries = 0;

    const snap = () => {
      const width = el.clientWidth;

      // layout前だと width=0 になり得るので数回リトライ
      if (!width && tries < 20) {
        tries += 1;
        raf = requestAnimationFrame(snap);
        return;
      }

      const x = activeTab === "followers" ? 0 : width;

      // ここは “smooth” ではなく即合わせ（初期のズレ防止）
      syncingRef.current = true;
      el.scrollLeft = x;

      // 直後のscrollイベント抑制
      setTimeout(() => {
        syncingRef.current = false;
      }, 50);
    };

    raf = requestAnimationFrame(snap);
    return () => cancelAnimationFrame(raf);
  }, [activeTab]);

  // ------------------------------
  // スワイプ（スクロール）でタブを更新し、URLも同期
  // ------------------------------
  useEffect(() => {
    const el = pagerRef.current;
    if (!el) return;
    if (!isValidTarget || !targetUserId) return;

    let raf = 0;

    const onScroll = () => {
      if (syncingRef.current) return;

      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const width = el.clientWidth || 1;
        const idx = Math.round(el.scrollLeft / width);
        const next: TabKey = idx <= 0 ? "followers" : "follows";

        setActiveTab((prev) => {
          if (prev === next) return prev;
          // URL更新（replace）
          router.replace(`/connections/${targetUserId}?tab=${next}`);
          return next;
        });
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll as any);
    };
  }, [router, isValidTarget, targetUserId]);

  const gotoTab = (tab: TabKey) => {
    if (!isValidTarget || !targetUserId) return;

    router.replace(`/connections/${targetUserId}?tab=${tab}`);
    setActiveTab(tab);

    const el = pagerRef.current;
    if (!el) return;

    const width = el.clientWidth || 1;
    const x = tab === "followers" ? 0 : width;

    syncingRef.current = true;
    el.scrollTo({ left: x, behavior: "smooth" });
    setTimeout(() => {
      syncingRef.current = false;
    }, 250);
  };

  // ------------------------------
  // DB: followers/follows を新しい順で取得
  // ------------------------------
  const buildConnectionList = useCallback(
    async (kind: TabKey): Promise<ConnectionUser[]> => {
      if (!authUserId) return [];
      if (!isValidTarget || !targetUserId) return [];

      // kindに応じて relations を引く
      // followers: target_id = targetUserId
      // follows:   user_id   = targetUserId
      const relQuery = supabase
        .from("relations")
        .select("user_id, target_id, type, created_at")
        .eq("type", "follow")
        .order("created_at", { ascending: false });

      const { data: rels, error: relErr } =
        kind === "followers"
          ? await relQuery.eq("target_id", targetUserId)
          : await relQuery.eq("user_id", targetUserId);

      if (relErr) throw relErr;

      const rows = (rels ?? []) as any[];
      const idsInOrder =
        kind === "followers"
          ? rows.map((r) => r.user_id).filter((x) => isUuid(x))
          : rows.map((r) => r.target_id).filter((x) => isUuid(x));

      const followedAtById = new Map<string, string>();
      rows.forEach((r) => {
        const id = kind === "followers" ? r.user_id : r.target_id;
        if (isUuid(id) && r.created_at) followedAtById.set(id, r.created_at);
      });

      // 0件なら終了
      if (idsInOrder.length === 0) return [];

      // users をまとめて取得
      const { data: users, error: uErr } = await supabase
        .from("users")
        .select("id, name, role, avatar_url, area, description")
        .in("id", idsInOrder);

      if (uErr) throw uErr;

      const userList = (users ?? []) as DbUserRow[];
      const userById = new Map(userList.map((u) => [u.id, u]));

      // therapist/store 補完（不足時だけ使う）
      const therapistUserIds = userList
        .filter((u) => u.role === "therapist")
        .map((u) => u.id);
      const storeOwnerIds = userList
        .filter((u) => u.role === "store")
        .map((u) => u.id);

      const [therapistsRes, storesRes] = await Promise.all([
        therapistUserIds.length
          ? supabase
              .from("therapists")
              .select("id, user_id, display_name, area, profile")
              .in("user_id", therapistUserIds)
          : Promise.resolve({ data: [], error: null } as any),
        storeOwnerIds.length
          ? supabase
              .from("stores")
              .select("id, owner_user_id, name, area, description")
              .in("owner_user_id", storeOwnerIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (therapistsRes.error) throw therapistsRes.error;
      if (storesRes.error) throw storesRes.error;

      const therapistByUserId = new Map<string, DbTherapistRow>();
      (therapistsRes.data ?? []).forEach((t: any) => {
        if (t?.user_id) therapistByUserId.set(t.user_id, t);
      });

      const storeByOwnerId = new Map<string, DbStoreRow>();
      (storesRes.data ?? []).forEach((s: any) => {
        if (s?.owner_user_id) storeByOwnerId.set(s.owner_user_id, s);
      });

      // viewer がフォローしている相手をまとめて取得（viewer->target）
      const { data: myFollows, error: mfErr } = await supabase
        .from("relations")
        .select("target_id")
        .eq("type", "follow")
        .eq("user_id", authUserId)
        .in("target_id", idsInOrder);

      if (mfErr) throw mfErr;
      const myFollowSet = new Set(
        (myFollows ?? []).map((r: any) => r.target_id).filter((x: any) => isUuid(x))
      );

      // idsInOrder の順で組み立て
      const list: ConnectionUser[] = idsInOrder
        .map((id) => {
          const u = userById.get(id);
          if (!u) return null;

          const role = (u.role ?? "user") as ConnectionUser["role"];
          const t = role === "therapist" ? therapistByUserId.get(id) : null;
          const s = role === "store" ? storeByOwnerId.get(id) : null;

          const displayName =
            normalizeFreeText(u.name) ||
            (role === "therapist" ? normalizeFreeText(t?.display_name) : "") ||
            (role === "store" ? normalizeFreeText(s?.name) : "") ||
            (role === "store" ? "店舗アカウント" : role === "therapist" ? "セラピスト" : "ユーザー");

          const intro =
            normalizeFreeText(u.description) ||
            (role === "therapist" ? normalizeFreeText(t?.profile) : "") ||
            (role === "store" ? normalizeFreeText(s?.description) : "") ||
            "まだ自己紹介はありません。";

          const area =
            normalizeFreeText(u.area) ||
            (role === "therapist" ? normalizeFreeText(t?.area) : "") ||
            (role === "store" ? normalizeFreeText(s?.area) : "") ||
            null;

          const handle = toPublicHandleFromUserId(id) ?? "@user";

          return {
            userId: id,
            role,
            displayName,
            handle,
            intro,
            area,
            avatar_url: u.avatar_url,
            isFollowing: myFollowSet.has(id),
            followedAt: followedAtById.get(id) ?? null,
          } satisfies ConnectionUser;
        })
        .filter(Boolean) as ConnectionUser[];

      return list;
    },
    [authUserId, isValidTarget, targetUserId]
  );

  const loadAll = useCallback(async () => {
    if (!authUserId) return;
    if (!isValidTarget || !targetUserId) return;

    setErrorText(null);

    setLoadingFollowers(true);
    setLoadingFollows(true);

    try {
      const [a, b] = await Promise.all([
        buildConnectionList("followers"),
        buildConnectionList("follows"),
      ]);

      setFollowers(a);
      setFollows(b);
    } catch (e: any) {
      console.error("[connections] load error:", e);
      setErrorText(e?.message ?? "つながりの取得に失敗しました。");
      setFollowers([]);
      setFollows([]);
    } finally {
      setLoadingFollowers(false);
      setLoadingFollows(false);
    }
  }, [authUserId, isValidTarget, targetUserId, buildConnectionList]);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (!isValidTarget || !targetUserId) return;
    void loadAll();
  }, [isLoggedIn, isValidTarget, targetUserId, loadAll]);

  // ------------------------------
  // Handlers
  // ------------------------------
  const openProfile = (userId: string) => {
    router.push(`/mypage/${userId}`);
  };

  const toggleFollow = async (userId: string, nextEnabled: boolean) => {
    if (!authUserId) return;
    if (!isUuid(userId)) return;

    // optimistic update
    const apply = (tab: TabKey) => {
      const updater = (prev: ConnectionUser[]) =>
        prev.map((x) => (x.userId === userId ? { ...x, isFollowing: nextEnabled } : x));

      if (tab === "followers") setFollowers(updater);
      else setFollows(updater);
    };

    // 両タブに同一人物が出ることがある（相互フォローなど）ので両方更新
    apply("followers");
    apply("follows");

    const ok = await setRelationOnServer({
      userId: authUserId as UserId,
      targetId: userId as UserId,
      type: nextEnabled ? "follow" : null,
    });

    if (!ok) {
      // revert
      apply("followers");
      apply("follows");
      // revertを正しく戻すため、再取得（安全）
      void loadAll();
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
        {/* X風：上部タブ */}
        <div className="tabs">
          <button
            className={`tab ${activeTab === "followers" ? "active" : ""}`}
            onClick={() => gotoTab("followers")}
          >
            フォロワー
            <span className="count">{followersCount}</span>
          </button>

          <button
            className={`tab ${activeTab === "follows" ? "active" : ""}`}
            onClick={() => gotoTab("follows")}
          >
            フォロー中
            <span className="count">{followsCount}</span>
          </button>
        </div>

        {errorText && (
          <div className="error">
            {errorText}
            <button className="retry" onClick={() => loadAll()}>
              再読み込み
            </button>
          </div>
        )}

        {/* Swipe pager */}
        <div className="pager" ref={pagerRef}>
          {/* followers */}
          <section className="page">
            {loadingFollowers ? (
              <div className="empty">読み込んでいます…</div>
            ) : followers.length === 0 ? (
              <div className="empty">フォロワーはまだいません。</div>
            ) : (
              <div className="list">
                {followers.map((u) => (
                  <ConnectionRow
                    key={`followers:${u.userId}`}
                    item={u}
                    onOpenProfile={openProfile}
                    onToggleFollow={(uid, next) => toggleFollow(uid, next)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* follows */}
          <section className="page">
            {loadingFollows ? (
              <div className="empty">読み込んでいます…</div>
            ) : follows.length === 0 ? (
              <div className="empty">フォロー中はまだありません。</div>
            ) : (
              <div className="list">
                {follows.map((u) => (
                  <ConnectionRow
                    key={`follows:${u.userId}`}
                    item={u}
                    onOpenProfile={openProfile}
                    onToggleFollow={(uid, next) => toggleFollow(uid, next)}
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

        .error {
          padding: 10px 0;
          font-size: 13px;
          color: #b00020;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .retry {
          border: 1px solid rgba(148, 163, 184, 0.55);
          background: var(--surface);
          color: var(--text-main);
          padding: 6px 10px;
          border-radius: 999px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
        }

        /* pager */
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