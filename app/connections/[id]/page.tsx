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

type TabKey = "followers" | "following";

/**
 * URL tab のゆれを吸収して内部は必ず followers/following に統一
 * - followers / following を受ける
 * - 過去互換: follows / follow / followings なども following 扱い
 */
function normalizeTab(v: string | null): TabKey {
  const s = (v ?? "").toLowerCase().trim();
  if (s === "following" || s === "followings" || s === "follows" || s === "follow") {
    return "following";
  }
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
  intro: string; // users.description / therapists.profile / stores.description を統一表示
  area?: string | null;
  avatar_url?: string | null; // raw
  isFollowing: boolean; // viewer目線
};

// users（正）
type DbUserRow = {
  id: string;
  name: string | null;
  role: "user" | "therapist" | "store" | null;
  avatar_url: string | null;
  area: string | null;
  description: string | null;
};

// therapists（補完用）
type DbTherapistMini = {
  user_id: string;
  display_name: string | null;
  area: string | null;
  profile: string | null;
  avatar_url: string | null;
};

// stores（補完用）
type DbStoreMini = {
  owner_user_id: string;
  name: string | null;
  area: string | null;
  description: string | null;
  avatar_url: string | null;
};

// relations（follow）
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

      {/* 右：ボタン（RelationActions に統一。…メニューはCSSで非表示） */}
      <div className="right-col">
        <RelationActions
          className="conn-follow-actions"
          flags={flags}
          onToggleFollow={() => onToggleFollow(item.userId, !item.isFollowing)}
          onToggleMute={() => {}}
          onToggleBlock={() => {}}
          onReport={() => {}}
        />
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
          width: 102px; /* 2行相当の存在感 */
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }

        /* RelationActions をこのセルサイズに馴染ませる */
        :global(.conn-follow-actions) {
          margin-top: 0;
        }
        :global(.conn-follow-actions .relation-actions-row) {
          margin-top: 0;
        }
        /* …メニューは connections では不要（Xの一覧と同じでフォローだけ） */
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
  const [guestUserId, setGuestUserId] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // tab
  const initialTab: TabKey = normalizeTab(searchParams.get("tab"));
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  // refs for stable sync
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const isSyncingRef = useRef<boolean>(true); // 初期/プログラム同期中ガード
  const activeTabRef = useRef<TabKey>(initialTab);

  // data
  const [followers, setFollowers] = useState<ConnectionUser[]>([]);
  const [following, setFollows] = useState<ConnectionUser[]>([]);

  const [loadingFollowers, setLoadingFollowers] = useState(false);
  const [loadingFollows, setLoadingFollows] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  // ログイン必須
  const isLoggedIn = !!authUserId;

  // ------------------------------
  // URL tab を正規化して固定（follows等を残さない）
  // ------------------------------
  useEffect(() => {
    if (!isValidTarget || !targetUserId) return;

    const raw = searchParams.get("tab");
    const normalized = normalizeTab(raw);

    // raw が null の場合も tab=followers を付けて「初回同期」を安定させる
    const shouldReplace = raw !== normalized;

    if (shouldReplace) {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("tab", normalized);
      router.replace(`/connections/${targetUserId}?${sp.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValidTarget, targetUserId]);

  // ------------------------------
  // pager snap helpers
  // ------------------------------
  const snapPagerToTab = useCallback((tab: TabKey, behavior: ScrollBehavior) => {
    const el = pagerRef.current;
    if (!el) return;

    const doSnap = () => {
      const width = el.clientWidth || 0;
      if (!width) return false;

      isSyncingRef.current = true;

      const left = tab === "followers" ? 0 : width;
      el.scrollTo({ left, behavior });

      // 2フレーム吸収（初期のscroll / 慣性 / smooth開始直後のscrollイベント対策）
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          isSyncingRef.current = false;
        });
      });

      return true;
    };

    // width 確定待ち
    requestAnimationFrame(() => {
      if (doSnap()) return;
      requestAnimationFrame(() => {
        if (doSnap()) return;
        // 最後の保険：ガード解除だけはする（無限ガードを避ける）
        isSyncingRef.current = false;
      });
    });
  }, []);

  // ------------------------------
  // URL -> state 同期（URL tab が変わったら activeTab を更新し、pager を強制一致）
  // ------------------------------
  useEffect(() => {
    const next = normalizeTab(searchParams.get("tab"));

    if (activeTabRef.current !== next) {
      activeTabRef.current = next;
      setActiveTab(next);
    }

    // 初回表示ズレの根治：URLに合わせて pager を即スナップ（smooth禁止）
    snapPagerToTab(next, "auto");
  }, [searchParams, snapPagerToTab]);

  // ------------------------------
  // scroll -> state/URL 同期（スワイプでタブ更新）
  // ------------------------------
  useEffect(() => {
    const el = pagerRef.current;
    if (!el) return;

    let raf = 0;

    const onScroll = () => {
      if (isSyncingRef.current) return;

      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const width = el.clientWidth || 1;
        const idx = Math.round(el.scrollLeft / width);
        const next: TabKey = idx <= 0 ? "followers" : "following";

        if (activeTabRef.current === next) return;

        activeTabRef.current = next;
        setActiveTab(next);

        if (isValidTarget && targetUserId) {
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
  // tab click handler（state/URL更新 + smooth スクロール）
  // ------------------------------
  const goTab = useCallback(
    (tab: TabKey) => {
      if (!isValidTarget || !targetUserId) return;

      activeTabRef.current = tab;
      setActiveTab(tab);

      router.replace(`/connections/${targetUserId}?tab=${tab}`);

      // ユーザー操作のときだけ smooth
      snapPagerToTab(tab, "smooth");
    },
    [router, isValidTarget, targetUserId, snapPagerToTab]
  );

  // ------------------------------
  // DB helpers
  // ------------------------------
  async function hydrateUsers(
    idsInOrder: string[],
    viewerId: string
  ): Promise<ConnectionUser[]> {
    // 1) users（正）
    const { data: users, error: uErr } = await supabase
      .from("users")
      .select("id, name, role, avatar_url, area, description")
      .in("id", idsInOrder);

    if (uErr) throw uErr;

    const userRows = (users ?? []) as DbUserRow[];
    const userMap = new Map<string, DbUserRow>();
    userRows.forEach((u) => userMap.set(u.id, u));

    // 2) rolesごとの補完をまとめて取得
    const therapistUserIds: string[] = [];
    const storeOwnerIds: string[] = [];

    for (const id of idsInOrder) {
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
      ((ts ?? []) as DbTherapistMini[]).forEach((t) =>
        therapistMap.set(t.user_id, t)
      );
    }

    const storeMap = new Map<string, DbStoreMini>();
    if (storeOwnerIds.length > 0) {
      const { data: ss, error: sErr } = await supabase
        .from("stores")
        .select("owner_user_id, name, area, description, avatar_url")
        .in("owner_user_id", storeOwnerIds);

      if (sErr) throw sErr;
      ((ss ?? []) as DbStoreMini[]).forEach((s) =>
        storeMap.set(s.owner_user_id, s)
      );
    }

    // 3) viewer の follow 状態（一括）
    const { data: myFollows, error: fErr } = await supabase
      .from("relations")
      .select("target_id")
      .eq("user_id", viewerId)
      .eq("type", "follow")
      .in("target_id", idsInOrder);

    if (fErr) throw fErr;

    const followingSet = new Set<string>(
      (myFollows ?? []).map((r: any) => r.target_id).filter(Boolean)
    );

    // 4) idsInOrder の順番で ConnectionUser を構築
    const result: ConnectionUser[] = idsInOrder.map((id) => {
      const u = userMap.get(id);

      const role = (u?.role ?? "user") as "user" | "therapist" | "store";

      const baseDisplayName = normalizeFreeText(u?.name);
      const baseArea = normalizeFreeText(u?.area);
      const baseIntro = normalizeFreeText(u?.description);

      let displayName =
        baseDisplayName ||
        (role === "store"
          ? "店舗アカウント"
          : role === "therapist"
          ? "セラピスト"
          : "ユーザー");

      let area = baseArea || null;
      let intro = baseIntro || "";
      let avatarRaw = u?.avatar_url ?? null;

      if (role === "therapist") {
        const t = therapistMap.get(id);
        if (t) {
          if (!baseDisplayName && normalizeFreeText(t.display_name))
            displayName = normalizeFreeText(t.display_name);
          if (!baseArea && normalizeFreeText(t.area))
            area = normalizeFreeText(t.area);
          if (!baseIntro && normalizeFreeText(t.profile))
            intro = normalizeFreeText(t.profile);
          // users.avatar_url が無いときだけ補完
          if (!looksValidAvatarUrl(avatarRaw) && looksValidAvatarUrl(t.avatar_url))
            avatarRaw = t.avatar_url;
        }
      }

      if (role === "store") {
        const s = storeMap.get(id);
        if (s) {
          if (!baseDisplayName && normalizeFreeText(s.name))
            displayName = normalizeFreeText(s.name);
          if (!baseArea && normalizeFreeText(s.area))
            area = normalizeFreeText(s.area);
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

    return result;
  }

  // ------------------------------
  // Fetch followers / following (newest first)
  // ------------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadFollowers() {
      if (!isValidTarget || !authUserId) return;
      setLoadingFollowers(true);
      setErrorMsg(null);

      try {
        // フォロワー：target_id = targetUserId をフォローしている user_id
        const { data, error } = await supabase
          .from("relations")
          .select("user_id, target_id, type, created_at")
          .eq("type", "follow")
          .eq("target_id", targetUserId)
          .order("created_at", { ascending: false });

        if (error) throw error;

        const rows = (data ?? []) as DbRelationRow[];
        const idsInOrder = rows
          .map((r) => r.user_id)
          .filter((x): x is string => !!x);

        // 重複排除（順序維持）
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
            e?.message ??
              "フォロワーの取得に失敗しました。時間をおいて再度お試しください。"
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

    async function loadFollows() {
      if (!isValidTarget || !authUserId) return;
      setLoadingFollows(true);
      setErrorMsg(null);

      try {
        // フォロー中：user_id = targetUserId がフォローしている target_id
        const { data, error } = await supabase
          .from("relations")
          .select("user_id, target_id, type, created_at")
          .eq("type", "follow")
          .eq("user_id", targetUserId)
          .order("created_at", { ascending: false });

        if (error) throw error;

        const rows = (data ?? []) as DbRelationRow[];
        const idsInOrder = rows
          .map((r) => r.target_id)
          .filter((x): x is string => !!x);

        const seen = new Set<string>();
        const uniqIds = idsInOrder.filter((id) =>
          seen.has(id) ? false : (seen.add(id), true)
        );

        const list = await hydrateUsers(uniqIds, authUserId);
        if (!cancelled) setFollows(list);
      } catch (e: any) {
        console.error("[Connections] loadFollows error:", e);
        if (!cancelled)
          setErrorMsg(
            e?.message ??
              "フォロー中の取得に失敗しました。時間をおいて再度お試しください。"
          );
      } finally {
        if (!cancelled) setLoadingFollows(false);
      }
    }

    void loadFollows();

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

    // optimistic update
    setFollowers((prev) =>
      prev.map((x) => (x.userId === targetId ? { ...x, isFollowing: nextEnabled } : x))
    );
    setFollows((prev) =>
      prev.map((x) => (x.userId === targetId ? { ...x, isFollowing: nextEnabled } : x))
    );

    const ok = await setRelationOnServer({
      userId: authUserId as UserId,
      targetId: targetId as UserId,
      type: nextEnabled ? "follow" : null,
    });

    if (!ok) {
      // rollback
      setFollowers((prev) =>
        prev.map((x) => (x.userId === targetId ? { ...x, isFollowing: !nextEnabled } : x))
      );
      setFollows((prev) =>
        prev.map((x) => (x.userId === targetId ? { ...x, isFollowing: !nextEnabled } : x))
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

  // ==============================
  // main render
  // ==============================
  const followersCount = followers.length;
  const followingCount = following.length;

  return (
    <div className="app-shell">
      <AppHeader title="つながり" subtitle={targetHandle} showBack />

      <main className="app-main connections-main">
        {/* X風：上部タブ（下にインジケータ） */}
        <div className="tabs">
          <button
            className={`tab ${activeTab === "following" ? "active" : ""}`}
            onClick={() => goTab("following")}
          >
            フォロー中
            <span className="count">{followingCount}</span>
          </button>

          <button
            className={`tab ${activeTab === "followers" ? "active" : ""}`}
            onClick={() => goTab("followers")}
          >
            フォロワー
            <span className="count">{followersCount}</span>
          </button>
        </div>

        {errorMsg && (
          <div className="error-box" role="alert">
            {errorMsg}
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
                    onToggleFollow={toggleFollow}
                  />
                ))}
              </div>
            )}
          </section>

          {/* following */}
          <section className="page">
            {loadingFollows ? (
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