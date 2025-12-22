// app/connections/[id]/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import AvatarCircle from "@/components/AvatarCircle";
import { RelationActions } from "@/components/RelationActions";

import { supabase } from "@/lib/supabaseClient";
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

type TabKey = "following" | "followers";

function normalizeTab(v: string | null): TabKey {
  const s = (v ?? "").toLowerCase().trim();
  if (s === "following" || s === "followings" || s === "follows" || s === "follow")
    return "following";
  return "followers";
}

const FOLLOW_TYPES = ["follow", "following"] as const;

// ===== Avatar URL =====
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
  return typeof v === "string" ? v.trim() : "";
}

// ==============================
// Types
// ==============================
type ConnectionUser = {
  userId: string;
  role: "user" | "therapist" | "store";
  displayName: string;
  handle: string;
  intro: string;
  area?: string | null;
  avatar_url?: string | null;
  isFollowing: boolean;
};

type DbUserRow = {
  id: string;
  name: string | null;
  role: "user" | "therapist" | "store" | null;
  avatar_url: string | null;
  area: string | null;
  description: string | null;
};

type DbTherapistMini = {
  user_id: string;
  display_name: string | null;
  area: string | null;
  profile: string | null;
  avatar_url: string | null;
};

type DbStoreMini = {
  owner_user_id: string;
  name: string | null;
  area: string | null;
  description: string | null;
  avatar_url: string | null;
};

type DbRelationRow = {
  user_id: string;
  target_id: string;
  type: string;
  created_at: string;
};

function roleLabel(role: ConnectionUser["role"]) {
  if (role === "store") return "店舗";
  if (role === "therapist") return "セラピスト";
  return "ユーザー";
}

function buildHandle(userId: string): string {
  return toPublicHandleFromUserId(userId) ?? "@user";
}

// ==============================
// Row
// ==============================
function ConnectionRow(props: {
  item: ConnectionUser;
  onOpenProfile: (userId: string) => void;
  onToggleFollow: (userId: string, next: boolean) => void;
  hideFollow?: boolean;
}) {
  const { item, onOpenProfile, onToggleFollow, hideFollow } = props;

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
        <div className="avatar-col">
          <AvatarCircle size={56} avatarUrl={avatarUrl} displayName={item.displayName} alt="" />
        </div>

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

      <div className="right-col">
        {!hideFollow && (
          <RelationActions
            className="conn-follow-actions"
            flags={flags}
            onToggleFollow={() => onToggleFollow(item.userId, !item.isFollowing)}
            onToggleMute={() => {}}
            onToggleBlock={() => {}}
            onReport={() => {}}
          />
        )}
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
          width: 102px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }
        :global(.conn-follow-actions) {
          margin-top: 0;
        }
        :global(.conn-follow-actions .relation-actions-row) {
          margin-top: 0;
        }
        :global(.conn-follow-actions .relation-more) {
          display: none;
        }
      `}</style>
    </div>
  );
}

// ==============================
// Page (構造変更: transform pager)
// ==============================
const ConnectionsPage: React.FC = () => {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const targetUserId = params?.id;
  const isValidTarget = isUuid(targetUserId);

  const targetHandle = useMemo(() => {
    if (!isValidTarget) return "@user";
    return toPublicHandleFromUserId(targetUserId) ?? "@user";
  }, [isValidTarget, targetUserId]);

  // viewer
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // tab
  const [activeTab, setActiveTab] = useState<TabKey>("following");

  // progress (0..1) —— インジケータ/ドラッグ位置
  const [progress, setProgress] = useState(0); // 0=following, 1=followers
  const progressRef = useRef(0);

  // container width
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [vpW, setVpW] = useState(1);

  // drag state
  const dragRef = useRef<{
    dragging: boolean;
    horizontal: boolean;
    startX: number;
    startY: number;
    startProgress: number;
    pointerId: number | null;
  }>({
    dragging: false,
    horizontal: false,
    startX: 0,
    startY: 0,
    startProgress: 0,
    pointerId: null,
  });

  // data
  const [followers, setFollowers] = useState<ConnectionUser[]>([]);
  const [following, setFollowing] = useState<ConnectionUser[]>([]);
  const [loadingFollowers, setLoadingFollowers] = useState(false);
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ------------------------------
  // auth
  // ------------------------------
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
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

  const isLoggedIn = !!authUserId;

  // ------------------------------
  // viewport width watch
  // ------------------------------
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const update = () => setVpW(el.clientWidth || 1);
    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ------------------------------
  // URL -> tab
  // ------------------------------
  useEffect(() => {
    if (!isValidTarget) return;

    const raw = searchParams.get("tab");
    const normalized = raw ? normalizeTab(raw) : "following";

    if (raw && raw !== normalized) {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("tab", normalized);
      router.replace(`/connections/${targetUserId}?${sp.toString()}`);
      return;
    }

    // state sync
    setActiveTab(normalized);
    const p = normalized === "following" ? 0 : 1;
    setProgress(p);
    progressRef.current = p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isValidTarget, targetUserId]);

  const goTab = useCallback(
    (tab: TabKey) => {
      if (!isValidTarget || !targetUserId) return;
      setActiveTab(tab);
      const p = tab === "following" ? 0 : 1;
      setProgress(p);
      progressRef.current = p;
      router.replace(`/connections/${targetUserId}?tab=${tab}`);
    },
    [router, isValidTarget, targetUserId]
  );

  // ------------------------------
  // gesture (X風): transform pager をドラッグ
  // ------------------------------
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // 左右ドラッグでタブ切替、縦は通常スクロール
    const st = dragRef.current;
    st.dragging = true;
    st.horizontal = false;
    st.startX = e.clientX;
    st.startY = e.clientY;
    st.startProgress = progressRef.current;
    st.pointerId = e.pointerId;

    // capture
    (e.currentTarget as any).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const st = dragRef.current;
      if (!st.dragging) return;

      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;

      const THRESH = 8;

      if (!st.horizontal) {
        if (Math.abs(dx) < THRESH && Math.abs(dy) < THRESH) return;
        if (Math.abs(dx) > Math.abs(dy)) {
          st.horizontal = true;
        } else {
          // 縦が勝った → このドラッグは縦スクロールに任せる
          st.dragging = false;
          st.pointerId = null;
          return;
        }
      }

      // 横ドラッグ確定：ブラウザの縦スクロール等を止める
      e.preventDefault();

      const delta = -dx / (vpW || 1); // dx右=followers方向へ（負号で調整）
      const next = Math.max(0, Math.min(1, st.startProgress + delta));
      setProgress(next);
      progressRef.current = next;
    },
    [vpW]
  );

  const endGesture = useCallback(() => {
    const st = dragRef.current;
    if (!st.horizontal) {
      st.dragging = false;
      st.pointerId = null;
      return;
    }

    // 最寄りへスナップ
    const nextTab: TabKey = progressRef.current < 0.5 ? "following" : "followers";
    setActiveTab(nextTab);
    const p = nextTab === "following" ? 0 : 1;
    setProgress(p);
    progressRef.current = p;

    if (isValidTarget && targetUserId) {
      router.replace(`/connections/${targetUserId}?tab=${nextTab}`);
    }

    st.dragging = false;
    st.pointerId = null;
    st.horizontal = false;
  }, [router, isValidTarget, targetUserId]);

  const onPointerUp = useCallback(() => endGesture(), [endGesture]);
  const onPointerCancel = useCallback(() => endGesture(), [endGesture]);

  // ------------------------------
  // DB hydrate
  // ------------------------------
  async function hydrateUsers(idsInOrder: string[], viewerId: string): Promise<ConnectionUser[]> {
    const ids = idsInOrder.filter((id) => id !== viewerId);
    if (ids.length === 0) return [];

    const { data: users, error: uErr } = await supabase
      .from("users")
      .select("id, name, role, avatar_url, area, description")
      .in("id", ids);

    if (uErr) throw uErr;

    const userRows = (users ?? []) as DbUserRow[];
    const userMap = new Map<string, DbUserRow>();
    userRows.forEach((u) => userMap.set(u.id, u));

    const therapistUserIds: string[] = [];
    const storeOwnerIds: string[] = [];

    for (const id of ids) {
      const u = userMap.get(id);
      const role = (u?.role ?? "user") as "user" | "therapist" | "store";
      if (role === "therapist") therapistUserIds.push(id);
      if (role === "store") storeOwnerIds.push(id);
    }

    const therapistMap = new Map<string, DbTherapistMini>();
    if (therapistUserIds.length > 0) {
      const { data: ts, error: tErr } = await supabase
        .from("therapists")
        .select("user_id, display_name, area, profile, avatar_url")
        .in("user_id", therapistUserIds);

      if (tErr) throw tErr;
      ((ts ?? []) as DbTherapistMini[]).forEach((t) => therapistMap.set(t.user_id, t));
    }

    const storeMap = new Map<string, DbStoreMini>();
    if (storeOwnerIds.length > 0) {
      const { data: ss, error: sErr } = await supabase
        .from("stores")
        .select("owner_user_id, name, area, description, avatar_url")
        .in("owner_user_id", storeOwnerIds);

      if (sErr) throw sErr;
      ((ss ?? []) as DbStoreMini[]).forEach((s) => storeMap.set(s.owner_user_id, s));
    }

    const { data: myFollowing, error: fErr } = await supabase
      .from("relations")
      .select("target_id")
      .eq("user_id", viewerId)
      .in("type", FOLLOW_TYPES as any)
      .in("target_id", ids);

    if (fErr) throw fErr;

    const followingSet = new Set<string>(
      (myFollowing ?? []).map((r: any) => r.target_id).filter(Boolean)
    );

    return ids.map((id) => {
      const u = userMap.get(id);
      const role = (u?.role ?? "user") as "user" | "therapist" | "store";

      const baseDisplayName = normalizeFreeText(u?.name);
      const baseArea = normalizeFreeText(u?.area);
      const baseIntro = normalizeFreeText(u?.description);

      let displayName =
        baseDisplayName ||
        (role === "store" ? "店舗アカウント" : role === "therapist" ? "セラピスト" : "ユーザー");

      let area = baseArea || null;
      let intro = baseIntro || "";
      let avatarRaw = u?.avatar_url ?? null;

      if (role === "therapist") {
        const t = therapistMap.get(id);
        if (t) {
          if (!baseDisplayName && normalizeFreeText(t.display_name))
            displayName = normalizeFreeText(t.display_name);
          if (!baseArea && normalizeFreeText(t.area)) area = normalizeFreeText(t.area);
          if (!baseIntro && normalizeFreeText(t.profile)) intro = normalizeFreeText(t.profile);
          if (!looksValidAvatarUrl(avatarRaw) && looksValidAvatarUrl(t.avatar_url))
            avatarRaw = t.avatar_url;
        }
      }

      if (role === "store") {
        const s = storeMap.get(id);
        if (s) {
          if (!baseDisplayName && normalizeFreeText(s.name))
            displayName = normalizeFreeText(s.name);
          if (!baseArea && normalizeFreeText(s.area)) area = normalizeFreeText(s.area);
          if (!baseIntro && normalizeFreeText(s.description))
            intro = normalizeFreeText(s.description);
          if (!looksValidAvatarUrl(avatarRaw) && looksValidAvatarUrl(s.avatar_url))
            avatarRaw = s.avatar_url;
        }
      }

      return {
        userId: id,
        role,
        displayName,
        handle: buildHandle(id),
        intro: intro || "",
        area,
        avatar_url: avatarRaw,
        isFollowing: followingSet.has(id),
      };
    });
  }

  // ------------------------------
  // Fetch followers / following
  // ------------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadFollowers() {
      if (!isValidTarget || !authUserId) return;
      setLoadingFollowers(true);
      setErrorMsg(null);

      try {
        const { data, error } = await supabase
          .from("relations")
          .select("user_id, target_id, type, created_at")
          .in("type", FOLLOW_TYPES as any)
          .eq("target_id", targetUserId)
          .order("created_at", { ascending: false });

        if (error) throw error;

        const rows = (data ?? []) as DbRelationRow[];
        const idsInOrder = rows.map((r) => r.user_id).filter((x): x is string => !!x);

        const seen = new Set<string>();
        const uniqIds = idsInOrder.filter((id) =>
          seen.has(id) ? false : (seen.add(id), true)
        );

        const list = await hydrateUsers(uniqIds, authUserId);
        if (!cancelled) setFollowers(list);
      } catch (e: any) {
        console.error("[Connections] loadFollowers error:", e);
        if (!cancelled)
          setErrorMsg(
            e?.message ?? "フォロワーの取得に失敗しました。時間をおいて再度お試しください。"
          );
      } finally {
        if (!cancelled) setLoadingFollowers(false);
      }
    }

    void loadFollowers();
    return () => {
      cancelled = true;
    };
  }, [isValidTarget, targetUserId, authUserId]);

  useEffect(() => {
    let cancelled = false;

    async function loadFollowing() {
      if (!isValidTarget || !authUserId) return;
      setLoadingFollowing(true);
      setErrorMsg(null);

      try {
        const { data, error } = await supabase
          .from("relations")
          .select("user_id, target_id, type, created_at")
          .in("type", FOLLOW_TYPES as any)
          .eq("user_id", targetUserId)
          .order("created_at", { ascending: false });

        if (error) throw error;

        const rows = (data ?? []) as DbRelationRow[];
        const idsInOrder = rows.map((r) => r.target_id).filter((x): x is string => !!x);

        const seen = new Set<string>();
        const uniqIds = idsInOrder.filter((id) =>
          seen.has(id) ? false : (seen.add(id), true)
        );

        const list = await hydrateUsers(uniqIds, authUserId);
        if (!cancelled) setFollowing(list);
      } catch (e: any) {
        console.error("[Connections] loadFollowing error:", e);
        if (!cancelled)
          setErrorMsg(
            e?.message ?? "フォロー中の取得に失敗しました。時間をおいて再度お試しください。"
          );
      } finally {
        if (!cancelled) setLoadingFollowing(false);
      }
    }

    void loadFollowing();
    return () => {
      cancelled = true;
    };
  }, [isValidTarget, targetUserId, authUserId]);

  // ------------------------------
  // Handlers
  // ------------------------------
  const openProfile = (userId: string) => {
    router.push(`/mypage/${userId}`);
  };

  const toggleFollow = async (targetId: string, nextEnabled: boolean) => {
    if (!authUserId) return;
    if (!isUuid(authUserId) || !isUuid(targetId)) return;
    if (authUserId === targetId) return;

    setFollowers((prev) => prev.map((x) => (x.userId === targetId ? { ...x, isFollowing: nextEnabled } : x)));
    setFollowing((prev) => prev.map((x) => (x.userId === targetId ? { ...x, isFollowing: nextEnabled } : x)));

    const ok = await setRelationOnServer({
      userId: authUserId as UserId,
      targetId: targetId as UserId,
      type: nextEnabled ? "follow" : null,
    });

    if (!ok) {
      setFollowers((prev) => prev.map((x) => (x.userId === targetId ? { ...x, isFollowing: !nextEnabled } : x)));
      setFollowing((prev) => prev.map((x) => (x.userId === targetId ? { ...x, isFollowing: !nextEnabled } : x)));
    }
  };

  // ------------------------------
  // Guards
  // ------------------------------
  if (!isValidTarget) {
    return (
      <div className="app-shell">
        <AppHeader title="つながり" showBack />
        <main className="app-main">
          <p className="empty-hint">このページは表示できません。</p>
        </main>
        <BottomNav />
        <style jsx>{`
          .empty-hint {
            font-size: 13px;
            color: var(--text-sub);
            line-height: 1.6;
          }
        `}</style>
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
        <style jsx>{`
          .empty-hint {
            font-size: 13px;
            color: var(--text-sub);
            line-height: 1.6;
          }
        `}</style>
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
            border-radius: 10px;
            border: 1px solid var(--border, rgba(0, 0, 0, 0.14));
            background: var(--surface, #ffffff);
            color: var(--text-main, #111111);
            cursor: pointer;
            font-weight: 700;
          }
          .primary-btn:hover {
            opacity: 0.92;
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

  const followersCount = followers.length;
  const followingCount = following.length;

  // transform: 0..1 => 0%..-50%? ではなく、トラックは 2画面分なので -progress*50vw…ではなく -progress*100%
  const trackStyle: React.CSSProperties = {
     transform: `translate3d(${-(progress * 50)}%, 0, 0)`,
  };

  return (
    <div className="app-shell">
      <AppHeader title="つながり" subtitle={targetHandle} showBack />

      <main className="app-main connections-main">
        <div className="tabsWrap">
          <div className="tabs" role="tablist" aria-label="connections tabs">
            <button
              className={`tab ${activeTab === "following" ? "active" : ""}`}
              onClick={() => goTab("following")}
              role="tab"
              aria-selected={activeTab === "following"}
            >
              フォロー中 <span className="count">{followingCount}</span>
            </button>

            <button
              className={`tab ${activeTab === "followers" ? "active" : ""}`}
              onClick={() => goTab("followers")}
              role="tab"
              aria-selected={activeTab === "followers"}
            >
              フォロワー <span className="count">{followersCount}</span>
            </button>

            <div
              className="tabIndicator"
              style={{ transform: `translate3d(${progress * 100}%,0,0)` }}
              aria-hidden="true"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="error-box" role="alert">
            {errorMsg}
          </div>
        )}

        {/* ★ ここが構造変更：scrollではなく transform pager */}
        <div
          className="viewport"
          ref={viewportRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <div className="track" style={trackStyle}>
            {/* following */}
            <section className="page">
              <div className="pageInner">
                {loadingFollowing ? (
                  <div className="empty">読み込んでいます…</div>
                ) : following.length === 0 ? (
                  <div className="empty">フォロー中はまだありません。</div>
                ) : (
                  <div className="list">
                    {following.map((u) => (
                      <ConnectionRow
                        key={`following:${u.userId}`}
                        item={u}
                        onOpenProfile={openProfile}
                        onToggleFollow={toggleFollow}
                        hideFollow={authUserId === u.userId}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* followers */}
            <section className="page">
              <div className="pageInner">
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
                        onToggleFollow={toggleFollow}
                        hideFollow={authUserId === u.userId}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>

      <BottomNav />

      <style jsx>{`
        .connections-main {
          padding: 0 16px 120px;
        }

        .tabsWrap {
          position: sticky;
          top: 0;
          z-index: 3;
          background: var(--surface, #fff);
        }

        .tabs {
          position: relative;
          display: flex;
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
          content: none;
        }

        .tabIndicator {
          position: absolute;
          left: 0;
          bottom: -1px;
          width: 50%;
          height: 3px;
          border-radius: 999px;
          background: var(--text-main);
          pointer-events: none;
          will-change: transform;
        }

        .error-box {
          margin: 10px 0 4px;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid rgba(176, 0, 32, 0.18);
          background: rgba(176, 0, 32, 0.06);
          color: #b00020;
          font-size: 12px;
          line-height: 1.6;
        }

        /* ★ viewport/track/page: X寄り構造 */
        .viewport {
          position: relative;
          width: 100%;
          overflow: hidden; /* 横はクリップ */
          touch-action: pan-y; /* 縦スクロールは自然に。横は pointer move で奪う */
          margin-top: 6px;
        }

        .track {
          display: flex;
          width: 200%;
          will-change: transform;
          transition: transform 220ms cubic-bezier(0.2, 0.9, 0.2, 1);
        }

        /* ドラッグ中は transition を切りたいが、簡易にするならこのままでOK
           厳密にやるなら st.horizontal のときだけ class を付けて transition:none にする */
        .page {
          flex: 0 0 50%;
          width: 50%;
        }

        /* 各ページは縦スクロール（iOSに強い） */
        .pageInner {
          max-height: calc(100vh - 180px); /* AppHeader+tabs+nav をざっくり避ける */
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 12px;
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

        @media (min-width: 768px) {
          .pageInner {
            max-height: calc(100vh - 200px);
          }
        }
      `}</style>
    </div>
  );
};

export default ConnectionsPage;