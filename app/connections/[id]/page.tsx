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

/**
 * URL tab のゆれを吸収して内部は必ず followers/following に統一
 */
function normalizeTab(v: string | null): TabKey {
  const s = (v ?? "").toLowerCase().trim();
  if (s === "following" || s === "followings" || s === "follows" || s === "follow") {
    return "following";
  }
  return "followers";
}

// relations.type 互換読み取り（過去の "following" を吸収）
const FOLLOW_TYPES = ["follow", "following"] as const;

// ===== Avatar URL 正規化 =====
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
  userId: string; // users.id (uuid)
  role: "user" | "therapist" | "store";
  displayName: string;
  handle: string;
  intro: string;
  area?: string | null;
  avatar_url?: string | null; // raw
  isFollowing: boolean; // viewer目線
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
// Row Component (X風)
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
// Page
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
  const initialTab: TabKey = normalizeTab(searchParams.get("tab"));
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  // indicator progress 0..1
  const [progress, setProgress] = useState<number>(initialTab === "following" ? 0 : 1);

  // refs
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef<TabKey>(initialTab);

  const isSyncingRef = useRef<boolean>(false);
  const didInitialSnapRef = useRef(false);
  const tickingRef = useRef(false);

  const snapTimerRef = useRef<any>(null);

  // data
  const [followers, setFollowers] = useState<ConnectionUser[]>([]);
  const [following, setFollowing] = useState<ConnectionUser[]>([]);
  const [loadingFollowers, setLoadingFollowers] = useState(false);
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ------------------------------
  // auth check
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
  // metrics（baseLeft/span を実測して統一）
  // ------------------------------
  const getMetrics = useCallback(() => {
    const el = pagerRef.current;
    if (!el) return null;

    const pages = Array.from(el.querySelectorAll<HTMLElement>(".page"));
    if (pages.length < 2) return null;

    const baseLeft = pages[0].offsetLeft || 0;
    const span = (pages[1].offsetLeft - pages[0].offsetLeft) || el.clientWidth || 0;
    if (span <= 0) return null;

    return { baseLeft, span };
  }, []);

  // ------------------------------
  // scrollToTab
  // ------------------------------
  const scrollToTab = useCallback(
    (tab: TabKey, behavior: ScrollBehavior) => {
      const el = pagerRef.current;
      if (!el) return;

      const m = getMetrics();
      if (!m) return;

      const idx = tab === "following" ? 0 : 1;
      const left = m.baseLeft + m.span * idx;

      isSyncingRef.current = true;
      el.scrollTo({ left, behavior });

      window.setTimeout(() => {
        isSyncingRef.current = false;
      }, behavior === "smooth" ? 360 : 200);
    },
    [getMetrics]
  );

  // ------------------------------
  // URL -> state 同期（※ここは “タブクリック時” のURL更新だけを見る）
  // - scroll中に router.replace しないので、巻き戻しが起きない
  // ------------------------------
  useEffect(() => {
    const raw = searchParams.get("tab");
    const next = raw ? normalizeTab(raw) : initialTab;

    if (activeTabRef.current !== next) {
      activeTabRef.current = next;
      setActiveTab(next);
      setProgress(next === "following" ? 0 : 1);
      scrollToTab(next, "auto");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, scrollToTab]);

  // ------------------------------
  // 初回：URL(tab) に合わせて必ず位置を合わせる（3段階で強制）
  // ------------------------------
  useEffect(() => {
    const el = pagerRef.current;
    if (!el) return;
    if (didInitialSnapRef.current) return;

    const m = getMetrics();
    if (!m) return;

    didInitialSnapRef.current = true;

    const tab = activeTabRef.current;
    setProgress(tab === "following" ? 0 : 1);

    const idx = tab === "following" ? 0 : 1;
    const left = m.baseLeft + m.span * idx;

    // 1) 即時
    el.scrollLeft = left;

    // 2) 2フレーム後
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const mm = getMetrics();
        if (!mm) return;
        const l = mm.baseLeft + mm.span * idx;
        el.scrollLeft = l;
      });
    });

    // 3) 少し後
    window.setTimeout(() => {
      const mm = getMetrics();
      if (!mm) return;
      const l = mm.baseLeft + mm.span * idx;
      el.scrollLeft = l;
    }, 220);
  }, [getMetrics]);

  // ------------------------------
  // finalize after snap（URL更新しない。activeTab/progress だけ確定）
  // ------------------------------
  const finalizeAfterSnap = useCallback(() => {
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);

    snapTimerRef.current = setTimeout(() => {
      const el = pagerRef.current;
      if (!el) return;
      if (isSyncingRef.current) return;

      const m = getMetrics();
      if (!m) return;

      const raw = (el.scrollLeft - m.baseLeft) / m.span;
      const p = Math.max(0, Math.min(1, raw));
      setProgress(p);

      const next: TabKey = p >= 0.5 ? "followers" : "following";
      if (activeTabRef.current !== next) {
        activeTabRef.current = next;
       setActiveTab(next);
      }
    }, 90);
  }, [getMetrics]);

  // ------------------------------
  // scroll handler（バー追従 + snap確定）
  // ------------------------------
  const handlePagerScroll = useCallback(() => {
    const el = pagerRef.current;
    if (!el) return;

    if (tickingRef.current) return;
    tickingRef.current = true;

    requestAnimationFrame(() => {
      tickingRef.current = false;

      const m = getMetrics();
      if (!m) return;

      const raw = (el.scrollLeft - m.baseLeft) / m.span;
      const p = Math.max(0, Math.min(1, raw));
      setProgress(p);

      if (!isSyncingRef.current) {
        const next: TabKey = p >= 0.5 ? "followers" : "following";
        if (activeTabRef.current !== next) {
          activeTabRef.current = next;
          setActiveTab(next);
        }
      }

      finalizeAfterSnap();
    });
  }, [finalizeAfterSnap, getMetrics]);

  // ------------------------------
  // tab click（ここだけ URL 更新する）
  // ------------------------------
  const goTab = useCallback(
    (tab: TabKey) => {
      if (!isValidTarget || !targetUserId) return;

      activeTabRef.current = tab;
      setActiveTab(tab);
      setProgress(tab === "following" ? 0 : 1);

      router.replace(`/connections/${targetUserId}?tab=${tab}`);
      scrollToTab(tab, "smooth");
    },
    [router, isValidTarget, targetUserId, scrollToTab]
  );

  // ------------------------------
  // DB helpers
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
        const uniqIds = idsInOrder.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));

        const list = await hydrateUsers(uniqIds, authUserId);
        if (!cancelled) setFollowers(list);
      } catch (e: any) {
        console.error("[Connections] loadFollowers error:", e);
        if (!cancelled) {
          setErrorMsg(
            e?.message ?? "フォロワーの取得に失敗しました。時間をおいて再度お試しください。"
          );
        }
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
        const uniqIds = idsInOrder.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));

        const list = await hydrateUsers(uniqIds, authUserId);
        if (!cancelled) setFollowing(list);
      } catch (e: any) {
        console.error("[Connections] loadFollowing error:", e);
        if (!cancelled) {
          setErrorMsg(
            e?.message ?? "フォロー中の取得に失敗しました。時間をおいて再度お試しください。"
          );
        }
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

    setFollowers((prev) =>
      prev.map((x) => (x.userId === targetId ? { ...x, isFollowing: nextEnabled } : x))
    );
    setFollowing((prev) =>
      prev.map((x) => (x.userId === targetId ? { ...x, isFollowing: nextEnabled } : x))
    );

    const ok = await setRelationOnServer({
      userId: authUserId as UserId,
      targetId: targetId as UserId,
      type: nextEnabled ? "follow" : null,
    });

    if (!ok) {
      setFollowers((prev) =>
        prev.map((x) => (x.userId === targetId ? { ...x, isFollowing: !nextEnabled } : x))
      );
      setFollowing((prev) =>
        prev.map((x) => (x.userId === targetId ? { ...x, isFollowing: !nextEnabled } : x))
      );
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

        <div className="pager" ref={pagerRef} onScroll={handlePagerScroll}>
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
      </main>

      <BottomNav />

      <style jsx>{`
        /* ★ 横paddingを外に持たせない（offsetLeft=0を作る） */
        .connections-main {
          padding: 0 0 120px;
        }

        .tabsWrap {
          position: sticky;
          top: 0;
          z-index: 3;
          background: var(--surface, #fff);
          padding: 0 16px; /* tabsだけ左右padding */
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
          margin: 10px 16px 4px; /* 横padding */
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid rgba(176, 0, 32, 0.18);
          background: rgba(176, 0, 32, 0.06);
          color: #b00020;
          font-size: 12px;
          line-height: 1.6;
        }

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
          flex: 0 0 100%;
          min-width: 100%;
          scroll-snap-align: start;
          padding-top: 6px;
        }

        .pageInner {
          padding: 0 16px; /* ★ ここで左右padding */
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