// app/connections/[id]/page.tsx
"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
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

/* ==============================
   util
============================== */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: string | null | undefined): v is string {
  return !!v && UUID_REGEX.test(v);
}

type TabKey = "followers" | "follows";

function normalizeTab(v: string | null): TabKey {
  return v === "follows" ? "follows" : "followers";
}

/* ==============================
   avatar utils（mypage と同一方針）
============================== */
const AVATAR_BUCKET = "avatars";

function resolveAvatarUrl(raw?: string | null): string | null {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;

  const path = raw.startsWith(`${AVATAR_BUCKET}/`)
    ? raw.slice(AVATAR_BUCKET.length + 1)
    : raw;

  const { data } = supabase.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(path);

  return data?.publicUrl ?? null;
}

/* ==============================
   types
============================== */
type ConnectionUser = {
  userId: string;
  role: "user" | "therapist" | "store";
  displayName: string;
  handle: string;
  intro: string;
  area?: string | null;
  avatar_url?: string | null;
  isFollowing: boolean;
  followedAt?: string | null;
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
  user_id: string;
  display_name: string | null;
  area: string | null;
  profile: string | null;
};

type DbStoreRow = {
  owner_user_id: string;
  name: string | null;
  area: string | null;
  description: string | null;
};

/* ==============================
   Row
============================== */
function ConnectionRow(props: {
  item: ConnectionUser;
  onOpenProfile: (id: string) => void;
  onToggleFollow: (id: string, next: boolean) => void;
}) {
  const { item, onOpenProfile, onToggleFollow } = props;

  const flags: RelationFlags = {
    following: item.isFollowing,
    muted: false,
    blocked: false,
  };

  return (
    <div className="conn-row">
      <button className="row-hit" onClick={() => onOpenProfile(item.userId)}>
        <AvatarCircle
          size={56}
          avatarUrl={resolveAvatarUrl(item.avatar_url)}
          displayName={item.displayName}
        />
        <div className="mid">
          <div className="name">{item.displayName}</div>
          <div className="meta">
            <span>{item.handle}</span>
            <span className="dot">·</span>
            <span>
              {item.role === "store"
                ? "店舗"
                : item.role === "therapist"
                ? "セラピスト"
                : "ユーザー"}
            </span>
          </div>
          <div className="intro">
            {item.intro || "まだ自己紹介はありません。"}
          </div>
        </div>
      </button>

      <div className="right">
        <RelationActions
          flags={flags}
          onToggleFollow={() =>
            onToggleFollow(item.userId, !item.isFollowing)
          }
          onToggleMute={() => {}}
          onToggleBlock={() => {}}
        />
      </div>
    </div>
  );
}

/* ==============================
   Page
============================== */
export default function ConnectionsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const targetUserId = params?.id ?? null;
  const isValidTarget = isUuid(targetUserId);

  /* ---------- auth ---------- */
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!cancel) setAuthUserId(data.user?.id ?? null);
      } finally {
        if (!cancel) setCheckingAuth(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  /* ---------- tab ---------- */
  const initialTab = normalizeTab(searchParams.get("tab"));
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  useEffect(() => {
    setActiveTab(normalizeTab(searchParams.get("tab")));
  }, [searchParams]);

  /* ---------- pager ---------- */
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef(false);
  const didInitialSnapRef = useRef(false);

  // 初回だけ確実にスナップ（←今回の核心）
  useEffect(() => {
    const el = pagerRef.current;
    if (!el) return;
    if (didInitialSnapRef.current) return;

    const width = el.clientWidth;
    if (!width) return;

    syncingRef.current = true;
    el.scrollLeft = activeTab === "followers" ? 0 : width;

    setTimeout(() => {
      syncingRef.current = false;
    }, 50);

    didInitialSnapRef.current = true;
  }, [activeTab]);

  // スワイプ → tab / URL 同期
  useEffect(() => {
    const el = pagerRef.current;
    if (!el || !isValidTarget || !targetUserId) return;

    const onScroll = () => {
      if (syncingRef.current) return;

      const width = el.clientWidth || 1;
      const idx = Math.round(el.scrollLeft / width);
      const next: TabKey = idx === 0 ? "followers" : "follows";

      if (next !== activeTab) {
        router.replace(`/connections/${targetUserId}?tab=${next}`);
        setActiveTab(next);
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [activeTab, router, isValidTarget, targetUserId]);

  /* ---------- data ---------- */
  const [followers, setFollowers] = useState<ConnectionUser[]>([]);
  const [follows, setFollows] = useState<ConnectionUser[]>([]);
  const [loading, setLoading] = useState(false);

  const loadAll = useCallback(async () => {
    if (!authUserId || !isValidTarget || !targetUserId) return;

    setLoading(true);

    try {
      const [{ data: f1 }, { data: f2 }] = await Promise.all([
        supabase
          .from("relations")
          .select("user_id")
          .eq("type", "follow")
          .eq("target_id", targetUserId),
        supabase
          .from("relations")
          .select("target_id")
          .eq("type", "follow")
          .eq("user_id", targetUserId),
      ]);

      const followerIds = (f1 ?? []).map((r: any) => r.user_id);
      const followIds = (f2 ?? []).map((r: any) => r.target_id);
      const allIds = Array.from(new Set([...followerIds, ...followIds]));

      if (allIds.length === 0) {
        setFollowers([]);
        setFollows([]);
        return;
      }

      const { data: users } = await supabase
        .from("users")
        .select("id, name, role, avatar_url, area, description")
        .in("id", allIds);

      const userById = new Map(
        (users ?? []).map((u: DbUserRow) => [u.id, u])
      );

      setFollowers(
        followerIds
          .map((id) => userById.get(id))
          .filter(Boolean)
          .map((u: any) => ({
            userId: u.id,
            role: u.role ?? "user",
            displayName: u.name ?? "ユーザー",
            handle: toPublicHandleFromUserId(u.id) ?? "@user",
            intro: u.description ?? "",
            avatar_url: u.avatar_url,
            isFollowing: followIds.includes(u.id),
          }))
      );

      setFollows(
        followIds
          .map((id) => userById.get(id))
          .filter(Boolean)
          .map((u: any) => ({
            userId: u.id,
            role: u.role ?? "user",
            displayName: u.name ?? "ユーザー",
            handle: toPublicHandleFromUserId(u.id) ?? "@user",
            intro: u.description ?? "",
            avatar_url: u.avatar_url,
            isFollowing: true,
          }))
      );
    } finally {
      setLoading(false);
    }
  }, [authUserId, isValidTarget, targetUserId]);

  useEffect(() => {
    if (!checkingAuth) loadAll();
  }, [checkingAuth, loadAll]);

  if (checkingAuth) return null;
  if (!authUserId) return null;

  /* ---------- render ---------- */
  return (
    <div className="app-shell">
      <AppHeader title="つながり" showBack />

      <main className="app-main">
        <div className="tabs">
          <button
            className={activeTab === "followers" ? "active" : ""}
            onClick={() =>
              router.replace(`/connections/${targetUserId}?tab=followers`)
            }
          >
            フォロワー {followers.length}
          </button>
          <button
            className={activeTab === "follows" ? "active" : ""}
            onClick={() =>
              router.replace(`/connections/${targetUserId}?tab=follows`)
            }
          >
            フォロー中 {follows.length}
          </button>
        </div>

        <div className="pager" ref={pagerRef}>
          <section className="page">
            {loading ? (
              <div className="empty">読み込み中…</div>
            ) : followers.length === 0 ? (
              <div className="empty">フォロワーはいません。</div>
            ) : (
              followers.map((u) => (
                <ConnectionRow
                  key={`follower:${u.userId}`}
                  item={u}
                  onOpenProfile={(id) => router.push(`/mypage/${id}`)}
                  onToggleFollow={async (id, next) => {
                    await setRelationOnServer({
                      userId: authUserId as UserId,
                      targetId: id as UserId,
                      type: next ? "follow" : null,
                    });
                    loadAll();
                  }}
                />
              ))
            )}
          </section>

          <section className="page">
            {loading ? (
              <div className="empty">読み込み中…</div>
            ) : follows.length === 0 ? (
              <div className="empty">フォロー中はいません。</div>
            ) : (
              follows.map((u) => (
                <ConnectionRow
                  key={`follow:${u.userId}`}
                  item={u}
                  onOpenProfile={(id) => router.push(`/mypage/${id}`)}
                  onToggleFollow={async (id, next) => {
                    await setRelationOnServer({
                      userId: authUserId as UserId,
                      targetId: id as UserId,
                      type: next ? "follow" : null,
                    });
                    loadAll();
                  }}
                />
              ))
            )}
          </section>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}