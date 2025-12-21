// app/store/[id]/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import AvatarCircle from "@/components/AvatarCircle";

import { supabase } from "@/lib/supabaseClient";
import { timeAgo } from "@/lib/timeAgo";

import {
  getRelation,
  setRelation as setRelationOnServer,
  toRelationFlags,
  type RelationFlags,
} from "@/lib/repositories/relationRepository";

import type { UserId } from "@/types/user";
import { RelationActions } from "@/components/RelationActions";
import { toPublicHandleFromUserId } from "@/lib/handle";

// ==============================
// 型定義（Supabase から取る最低限）
// ==============================
type DbStoreRow = {
  id: string;
  owner_user_id: string | null;
  name: string | null;
  area: string | null;
  description: string | null;
  website_url?: string | null;
  x_url?: string | null;
  twicas_url?: string | null;
  line_url?: string | null;
  avatar_url?: string | null;
};

type DbUserRow = {
  id: string;
  name: string | null;
  avatar_url: string | null;
};

/**
 * ★ 投稿の area はこのページでは使わない
 */
type DbPostRow = {
  id: string;
  author_id: string | null;
  body: string | null;
  created_at: string;
};

type DbTherapistRow = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

// relations は users.id（uuid）で持つ前提
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

// relations.type 互換（過去の "following" を吸収）
const FOLLOW_TYPES = ["follow", "following"] as const;

// ===== Avatar URL 正規化（Home/Therapist と同一思想で統一）=====
const AVATAR_BUCKET = "avatars";

function normalizeAvatarUrl(v: any): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

function isProbablyHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * URLとして使う前に「それっぽいゴミ」を弾く
 */
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

// 未読バッジは固定デモ
const hasUnread = true;

type StorePost = {
  id: string;
  body: string;
  timeAgo: string;
};

type TherapistHit = {
  id: string; // therapists.id
  userId: string | null; // users.id(uuid)
  displayName: string;
  avatarUrl: string | null;
  handle: string; // @xxxxxx
};

// 店舗IDがslugだった時代のフォールバック（ラベルだけ）
const AREA_LABEL_MAP: Record<string, string> = {
  lux: "中部（名古屋・東海エリア）",
  tokyo: "関東（東京近郊）",
  osaka: "近畿（大阪・京都など）",
};

const StoreProfilePage: React.FC = () => {
  const router = useRouter();

  const params = useParams<{ id: string }>();
  const storeId = (params?.id as string) || "store";

  // slug時代のフォールバック（表示だけ）
  const fallbackSlug =
    storeId === "lux" || storeId === "loomroom" ? storeId : "lux";

  const initialStoreName =
    fallbackSlug === "lux"
      ? "LuX nagoya"
      : fallbackSlug === "loomroom"
      ? "LRoom"
      : "LRoom 提携サロン";

  const initialAreaLabel =
    AREA_LABEL_MAP[fallbackSlug] || "全国（オンライン案内中心）";

  // ==============================
  // state
  // ==============================
  const [storeName, setStoreName] = useState<string>(initialStoreName);

  /**
   * ★ handle は「owner_user_id(uuid) → @xxxxxx」に統一
   */
  const [storeHandle, setStoreHandle] = useState<string>("");

  const [areaLabel, setAreaLabel] = useState<string>(initialAreaLabel);
  const [storeProfileText, setStoreProfileText] = useState<string | null>(null);

  const [websiteUrl, setWebsiteUrl] = useState<string | null>(null);
  const [xUrl, setXUrl] = useState<string | null>(null);
  const [twicasUrl, setTwicasUrl] = useState<string | null>(null);
  const [lineUrl, setLineUrl] = useState<string | null>(null);

  const [loadingProfile, setLoadingProfile] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Supabase Auth（uuid会員）
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  // relations用（店舗オーナー users.id）
  const [storeOwnerUserId, setStoreOwnerUserId] = useState<string | null>(null);

  // ★ 店舗アバター（DB正）
  const [storeAvatarUrl, setStoreAvatarUrl] = useState<string | null>(null);

  // ★ オーナーのユーザーアバター（fallback）
  const [ownerAvatarUrl, setOwnerAvatarUrl] = useState<string | null>(null);

  // ★ Owner 判定は Auth を正とする
  const isOwner =
    !!authUserId &&
    !!storeOwnerUserId &&
    isUuid(authUserId) &&
    isUuid(storeOwnerUserId) &&
    authUserId === storeOwnerUserId;

  const [relations, setRelations] = useState<RelationFlags>({
    following: false,
    muted: false,
    blocked: false,
  });

  // ★ connections 用のカウント（mypage と同一：表示対象 users.id を正）
  const [followingCount, setFollowingCount] = useState<number>(0);
  const [followersCount, setFollowersCount] = useState<number>(0);

  // 在籍セラピスト（DB）
  const [therapists, setTherapists] = useState<TherapistHit[]>([]);

  const [likes, setLikes] = useState<Record<string, boolean>>({});

  const [posts, setPosts] = useState<StorePost[]>([]);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [loadingPosts, setLoadingPosts] = useState<boolean>(false);

  // 在籍申請
  const [canApplyMembership, setCanApplyMembership] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyDone, setApplyDone] = useState(false);

  // Auth 初期化
  useEffect(() => {
    if (typeof window === "undefined") return;

    supabase.auth
      .getUser()
      .then(({ data }) => setAuthUserId(data.user?.id ?? null))
      .catch(() => setAuthUserId(null));
  }, []);

  // relation 復元（uuid会員同士のみ）
  useEffect(() => {
    if (isOwner) {
      setRelations({ following: false, muted: false, blocked: false });
      return;
    }

    if (!isUuid(authUserId) || !isUuid(storeOwnerUserId)) {
      setRelations({ following: false, muted: false, blocked: false });
      return;
    }
    if (authUserId === storeOwnerUserId) return;

    let cancelled = false;
    (async () => {
      const row = await getRelation(authUserId as UserId, storeOwnerUserId as UserId);
      if (cancelled) return;
      setRelations(toRelationFlags(row));
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId, storeOwnerUserId, isOwner]);

  // ★ フォロー中 / フォロワー数（mypage と同一：owner users.id を正）
  useEffect(() => {
    let cancelled = false;

    const loadCounts = async (userId: string) => {
      if (!isUuid(userId)) {
        if (!cancelled) {
          setFollowingCount(0);
          setFollowersCount(0);
        }
        return;
      }

      try {
        const followingReq = supabase
          .from("relations")
          .select("target_id", { count: "exact", head: true })
          .eq("user_id", userId)
          .in("type", FOLLOW_TYPES as any);

        const followersReq = supabase
          .from("relations")
          .select("user_id", { count: "exact", head: true })
          .eq("target_id", userId)
          .in("type", FOLLOW_TYPES as any);

        const [followingRes, followersRes] = await Promise.all([
          followingReq,
          followersReq,
        ]);

        if (cancelled) return;

        if (followingRes.error) {
          console.error("[StoreProfile] following count error:", followingRes.error);
        }
        if (followersRes.error) {
          console.error("[StoreProfile] followers count error:", followersRes.error);
        }

        setFollowingCount(followingRes.count ?? 0);
        setFollowersCount(followersRes.count ?? 0);
      } catch (e) {
        if (cancelled) return;
        console.error("[StoreProfile] count unexpected error:", e);
        setFollowingCount(0);
        setFollowersCount(0);
      }
    };

    if (storeOwnerUserId) {
      void loadCounts(storeOwnerUserId);
    } else {
      setFollowingCount(0);
      setFollowersCount(0);
    }

    return () => {
      cancelled = true;
    };
  }, [storeOwnerUserId]);

  // ★ connections に飛ばす（mypage と同一：users.id を正）
  const openConnections = (tab: "following" | "followers") => {
    if (!storeOwnerUserId || !isUuid(storeOwnerUserId)) return;
    router.push(`/connections/${storeOwnerUserId}?tab=${tab}`);
  };

  // 在籍申請ボタン表示判定（uuid会員の therapist のみ）
  useEffect(() => {
    let cancelled = false;

    const checkEligibility = async () => {
      if (!isUuid(authUserId)) {
        setCanApplyMembership(false);
        return;
      }
      if (authUserId === storeOwnerUserId) {
        setCanApplyMembership(false);
        return;
      }

      const { data: userRow } = await supabase
        .from("users")
        .select("role")
        .eq("id", authUserId)
        .maybeSingle();

      if (cancelled || userRow?.role !== "therapist") {
        setCanApplyMembership(false);
        return;
      }

      const { data: therapistRow } = await supabase
        .from("therapists")
        .select("store_id")
        .eq("user_id", authUserId)
        .maybeSingle();

      if (cancelled) return;

      setCanApplyMembership(!!therapistRow && therapistRow.store_id == null);
    };

    void checkEligibility();
    return () => {
      cancelled = true;
    };
  }, [authUserId, storeOwnerUserId]);

  // フォロー/ミュート/ブロック（uuid会員同士のみ）
  const handleToggleFollow = async () => {
    if (isOwner) return;
    if (!isUuid(authUserId) || !isUuid(storeOwnerUserId)) return;
    if (authUserId === storeOwnerUserId) return;

    const nextEnabled = !relations.following;

    const ok = await setRelationOnServer({
      userId: authUserId as UserId,
      targetId: storeOwnerUserId as UserId,
      type: nextEnabled ? "follow" : null,
    });
    if (!ok) return;

    setRelations({ following: nextEnabled, muted: false, blocked: false });

    // ★ 楽観更新：対象(owner)の followers が増減
    setFollowersCount((prev) => {
      const next = nextEnabled ? prev + 1 : prev - 1;
      return next < 0 ? 0 : next;
    });
  };

  const handleToggleMute = async () => {
    if (isOwner) return;
    if (!isUuid(authUserId) || !isUuid(storeOwnerUserId)) return;
    if (authUserId === storeOwnerUserId) return;

    const nextEnabled = !relations.muted;

    const ok = await setRelationOnServer({
      userId: authUserId as UserId,
      targetId: storeOwnerUserId as UserId,
      type: nextEnabled ? "mute" : null,
    });
    if (!ok) return;

    setRelations({ following: false, muted: nextEnabled, blocked: false });
  };

  const handleToggleBlock = async () => {
    if (isOwner) return;
    if (!isUuid(authUserId) || !isUuid(storeOwnerUserId)) return;
    if (authUserId === storeOwnerUserId) return;

    const nextEnabled = !relations.blocked;

    if (nextEnabled) {
      const ok = window.confirm(
        "この店舗アカウントをブロックしますか？\nタイムラインやDMからも非表示になります。"
      );
      if (!ok) return;
    }

    const ok = await setRelationOnServer({
      userId: authUserId as UserId,
      targetId: storeOwnerUserId as UserId,
      type: nextEnabled ? "block" : null,
    });
    if (!ok) return;

    setRelations({ following: false, muted: false, blocked: nextEnabled });
  };

  // ==============================
  // ★ 在籍申請：RPC直呼び（401回避）
  // ==============================
  const handleApplyMembership = async () => {
    try {
      setApplyLoading(true);

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      const authId = userData?.user?.id ?? null;

      if (userErr || !authId) {
        throw new Error("unauthorized");
      }

      const { error } = await supabase.rpc("rpc_create_therapist_store_request", {
        p_store_id: storeId,
      });

      if (error) {
        if (String(error.message || "").includes("already pending")) {
          setApplyDone(true);
          return;
        }
        throw new Error(error.message || "申請に失敗しました");
      }

      setApplyDone(true);
    } catch (e: any) {
      alert(e?.message ?? "在籍申請に失敗しました");
    } finally {
      setApplyLoading(false);
    }
  };

  // Supabase: 店舗プロフィール + 投稿
  useEffect(() => {
    let cancelled = false;

    const fetchProfileAndPosts = async () => {
      try {
        setLoadingProfile(true);
        setProfileError(null);
        setLoadingPosts(true);
        setPostsError(null);

        // 1) stores
        const { data: storeRow, error: sError } = await supabase
          .from("stores")
          .select(
            "id, owner_user_id, name, area, description, website_url, x_url, twicas_url, line_url, avatar_url"
          )
          .eq("id", storeId)
          .maybeSingle<DbStoreRow>();

        if (cancelled) return;

        if (sError) {
          console.error("[StoreProfile] store fetch error:", sError);
          setProfileError(
            (sError as any)?.message ?? "店舗プロフィールの取得に失敗しました。"
          );
          return;
        }
        if (!storeRow) {
          setProfileError("店舗プロフィールが見つかりませんでした。");
          return;
        }

        const row = storeRow as DbStoreRow;

        if (row.name?.trim()) setStoreName(row.name.trim());
        if (row.area?.trim()) setAreaLabel(row.area.trim());
        if (row.description?.trim()) setStoreProfileText(row.description);

        setWebsiteUrl(row.website_url?.trim() || null);
        setXUrl(row.x_url?.trim() || null);
        setTwicasUrl(row.twicas_url?.trim() || null);
        setLineUrl(row.line_url?.trim() || null);

        setStoreOwnerUserId(row.owner_user_id ?? null);

        // ★ 店舗 handle は owner_user_id から @6桁
        setStoreHandle(toPublicHandleFromUserId(row.owner_user_id) ?? "");

        // ★ 店舗アイコン（DB正）
        const storeAvatarResolved = looksValidAvatarUrl(row.avatar_url ?? null)
          ? resolveAvatarUrl(row.avatar_url ?? null)
          : null;
        setStoreAvatarUrl(storeAvatarResolved);

        // 2) users（avatar fallback用）
        if (row.owner_user_id) {
          const { data: userRow, error: uError } = await supabase
            .from("users")
            .select("id, name, avatar_url")
            .eq("id", row.owner_user_id)
            .maybeSingle<DbUserRow>();

          if (cancelled) return;

          if (uError) {
            console.error("[StoreProfile] owner user fetch error:", uError);
          } else if (userRow) {
            const ownerAvatarResolved = looksValidAvatarUrl(userRow.avatar_url)
              ? resolveAvatarUrl(userRow.avatar_url)
              : null;
            setOwnerAvatarUrl(ownerAvatarResolved);
          }

          // 3) posts (author_id=owner_user_id)
          const { data: postRows, error: pError } = await supabase
            .from("posts")
            .select("id, author_id, body, created_at")
            .eq("author_id", row.owner_user_id)
            .order("created_at", { ascending: false })
            .limit(50);

          if (cancelled) return;

          if (pError) {
            console.error("[StoreProfile] posts fetch error:", pError);
            setPostsError(
              (pError as any)?.message ??
                "お店の投稿の取得に失敗しました。時間をおいて再度お試しください。"
            );
            setPosts([]);
          } else {
            const mapped: StorePost[] = (postRows ?? []).map((r: any) => ({
              id: (r as DbPostRow).id,
              body: (r as DbPostRow).body ?? "",
              timeAgo: timeAgo((r as DbPostRow).created_at),
            }));
            setPosts(mapped);
          }
        } else {
          setPosts([]);
        }
      } catch (e: any) {
        if (cancelled) return;
        console.error("[StoreProfile] unexpected error:", e);
        setProfileError(
          e?.message ?? "店舗プロフィールの取得中に不明なエラーが発生しました。"
        );
        setPostsError(
          e?.message ?? "お店の投稿の取得中に不明なエラーが発生しました。"
        );
        setPosts([]);
      } finally {
        if (!cancelled) {
          setLoadingProfile(false);
          setLoadingPosts(false);
        }
      }
    };

    void fetchProfileAndPosts();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  // 在籍セラピスト（DB）
  useEffect(() => {
    let cancelled = false;

    const loadTherapists = async () => {
      try {
        const { data, error } = await supabase
          .from("therapists")
          .select("id, user_id, display_name, avatar_url, store_id")
          .eq("store_id", storeId);

        if (cancelled) return;
        if (error) throw error;

        const rows: TherapistHit[] = (data ?? []).map((t: any) => {
          const raw = (t as DbTherapistRow).avatar_url ?? null;
          const resolved = looksValidAvatarUrl(raw) ? resolveAvatarUrl(raw) : null;

          const displayName =
            ((t as DbTherapistRow).display_name ?? "").trim() || "セラピスト";

          const userId = (t as DbTherapistRow).user_id ?? null;

          return {
            id: String((t as DbTherapistRow).id),
            userId,
            displayName,
            avatarUrl: resolved,
            handle: toPublicHandleFromUserId(userId) ?? "",
          };
        });

        setTherapists(rows);
      } catch (e) {
        console.warn("[StoreProfile] therapists load failed:", e);
        setTherapists([]);
      }
    };

    void loadTherapists();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const storeInitial = storeName?.trim()?.charAt(0)?.toUpperCase() || "?";

  // ★ 表示に使う店舗アバターは「stores.avatar_url 優先 → owner users.avatar_url」
  const effectiveStoreAvatarUrl = storeAvatarUrl || ownerAvatarUrl || null;

  const toggleLike = (postId: string) => {
    setLikes((prev) => ({ ...prev, [postId]: !prev[postId] }));
  };

  // ★ Relation UI は uuid会員同士 + 自分以外 のときだけ
  const canShowRelationUi =
    !isOwner && isUuid(authUserId) && isUuid(storeOwnerUserId);

  // ★ DM は uuidログイン済み + 相手uuid + 自分以外 + ブロックしてない ときだけ
  const canShowDmButton =
    !isOwner &&
    !relations.blocked &&
    isUuid(authUserId) &&
    isUuid(storeOwnerUserId);

  return (
    <div className="app-shell">
      <AppHeader title={storeName} subtitle={storeHandle || ""} />

      <main className="app-main">
        {profileError && (
          <div style={{ padding: "4px 12px", fontSize: 11, color: "#b00020" }}>
            店舗情報の読み込みに失敗しました：{profileError}
          </div>
        )}

        <section className="store-hero">
          <div className="store-hero-row">
            <AvatarCircle
              className="store-avatar"
              size={48}
              avatarUrl={effectiveStoreAvatarUrl}
              displayName={storeName}
              fallbackText={storeInitial}
              alt=""
            />

            <div className="store-hero-main">
              <div className="store-name-row">
                <span className="store-name">{storeName}</span>
                <span className="store-handle">
                  {storeHandle || ""}

                  {canShowDmButton && storeOwnerUserId && (
                    <Link
                      href={`/messages/new?to=${storeOwnerUserId}`}
                      className="dm-inline-btn no-link-style"
                    >
                      ✉
                    </Link>
                  )}

                  {isOwner && (
                    <Link
                      href={`/store/${storeId}/console`}
                      className="edit-inline-btn no-link-style"
                    >
                      ✎
                    </Link>
                  )}
                </span>
              </div>

              <div className="store-meta-row">
                <span>アカウント種別：店舗</span>
                <span>対応エリア：{areaLabel}</span>
              </div>

              {/* ★ mypage と同一：フォロー中/フォロワーを表示、押したら connections */}
              <div className="store-stats-row">
                <span>
                  投稿 <strong>{posts.length}</strong>
                </span>

                <span>
                  在籍セラピスト <strong>{therapists.length}</strong>
                </span>

                <button
                  type="button"
                  className="stat-link"
                  onClick={() => openConnections("following")}
                  disabled={!isUuid(storeOwnerUserId)}
                  aria-label="フォロー中一覧を見る"
                >
                  フォロー中 <strong>{followingCount}</strong>
                </button>

                <button
                  type="button"
                  className="stat-link"
                  onClick={() => openConnections("followers")}
                  disabled={!isUuid(storeOwnerUserId)}
                  aria-label="フォロワー一覧を見る"
                >
                  フォロワー <strong>{followersCount}</strong>
                </button>
              </div>

              {canShowRelationUi && (
                <RelationActions
                  flags={relations}
                  onToggleFollow={handleToggleFollow}
                  onToggleMute={handleToggleMute}
                  onToggleBlock={handleToggleBlock}
                  onReport={() => {
                    console.log("report:", "profile", storeId);
                    alert("この店舗の通報を受け付けました（現在はテスト用です）。");
                  }}
                />
              )}

              {canApplyMembership && (
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    disabled={applyLoading || applyDone}
                    onClick={handleApplyMembership}
                    style={{
                      width: "100%",
                      borderRadius: 999,
                      padding: "10px 12px",
                      fontSize: 13,
                      fontWeight: 600,
                      border: "none",
                      background: applyDone ? "#ddd" : "var(--accent)",
                      color: applyDone ? "#666" : "#fff",
                      cursor: applyDone ? "default" : "pointer",
                    }}
                  >
                    {applyDone
                      ? "在籍申請済み"
                      : applyLoading
                      ? "申請中…"
                      : "この店舗に在籍申請する"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {loadingProfile && <p className="store-hero-lead">店舗情報を読み込んでいます…</p>}

          {!loadingProfile && storeProfileText?.trim() && (
            <p className="store-hero-lead">
              {storeProfileText.split("\n").map((line, idx, arr) => (
                <React.Fragment key={idx}>
                  {line}
                  {idx < arr.length - 1 && <br />}
                </React.Fragment>
              ))}
            </p>
          )}
        </section>

        {/* 在籍セラピスト一覧 */}
        <section className="surface-card store-card">
          <h2 className="store-section-title">在籍セラピスト</h2>

          {therapists.length === 0 ? (
            <p className="store-caption">
              まだ LRoom 上では在籍セラピストが登録されていません。
            </p>
          ) : (
            <ul className="therapist-list">
              {therapists.map((t) => (
                <li key={t.id} className="therapist-item">
                  <Link
                    href={`/therapist/${t.id}`}
                    className="therapist-link no-link-style"
                  >
                    <AvatarCircle
                      className="therapist-avatar"
                      size={40}
                      avatarUrl={t.avatarUrl}
                      displayName={t.displayName}
                      alt=""
                    />

                    <div className="therapist-item-main">
                      <div className="therapist-item-name">{t.displayName}</div>
                      <div className="therapist-item-id">{t.handle || ""}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 公式リンク */}
        <section className="surface-card store-card">
          <h2 className="store-section-title">公式リンク</h2>

          <div className="store-links">
            {websiteUrl && (
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="store-link-btn"
              >
                公式サイトを見る
              </a>
            )}

            {xUrl && (
              <a
                href={xUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="store-link-btn store-link-btn--ghost"
              >
                X（旧Twitter）
              </a>
            )}

            {twicasUrl && (
              <a
                href={twicasUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="store-link-btn store-link-btn--ghost"
              >
                ツイキャス
              </a>
            )}

            {lineUrl && (
              <a
                href={lineUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="store-link-btn store-link-btn--ghost"
              >
                公式LINE
              </a>
            )}
          </div>

          <p className="store-caption">
            ※ 上記リンクは LRoom 外のサービスです。各サービスごとの利用規約・ポリシーをご確認のうえご利用ください。
          </p>
        </section>

        {/* 投稿 */}
        <section className="surface-card store-card store-posts-section">
          <h2 className="store-section-title">お店の発信</h2>

          {loadingPosts && <p className="store-caption">投稿を読み込んでいます…</p>}
          {postsError && !loadingPosts && (
            <p className="store-caption" style={{ color: "#b00020" }}>
              {postsError}
            </p>
          )}
          {!loadingPosts && !postsError && posts.length === 0 && (
            <p className="store-caption">
              まだこのお店からの投稿はありません。少しずつ、雰囲気が分かる言葉を並べていく予定です。
            </p>
          )}

          {!loadingPosts && !postsError && posts.length > 0 && (
            <div className="feed-list">
              {posts.map((p: StorePost) => {
                const liked = !!likes[p.id];
                const likeCount = liked ? 1 : 0;

                return (
                  <article
                    key={p.id}
                    className="feed-item"
                    role="button"
                    tabIndex={0}
                    aria-label="投稿の詳細を見る"
                    onClick={() => router.push(`/posts/${p.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/posts/${p.id}`);
                      }
                    }}
                  >
                    <div className="feed-item-inner">
                      <AvatarCircle
                        size={40}
                        avatarUrl={effectiveStoreAvatarUrl}
                        displayName={storeName}
                        className="feed-avatar"
                        alt=""
                      />

                      <div className="feed-main">
                        <div className="feed-header">
                          <div className="feed-name-row">
                            <span className="post-name">{storeName}</span>
                            <span className="post-username">{storeHandle || ""}</span>
                          </div>

                          <div className="post-meta">
                            <span>{p.timeAgo}</span>
                          </div>
                        </div>

                        <div className="post-body">
                          {p.body.split("\n").map((line: string, idx: number) => (
                            <p key={idx}>
                              {line || <span style={{ opacity: 0.3 }}>　</span>}
                            </p>
                          ))}
                        </div>

                        <div className="post-actions">
                          <button
                            type="button"
                            className={
                              "post-like-btn" + (liked ? " post-like-btn--liked" : "")
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLike(p.id);
                            }}
                          >
                            <span className="post-like-icon">{liked ? "♥" : "♡"}</span>
                            <span className="post-like-count">{likeCount}</span>
                          </button>
                          <span className="post-action-text">コメント</span>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <BottomNav active="mypage" hasUnread={hasUnread} />

      <style jsx>{`
        .store-hero {
          padding: 4px 0 12px;
          border-bottom: 1px solid var(--border);
          margin-bottom: 8px;
        }

        .store-hero-row {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-bottom: 8px;
        }

        .store-hero-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .store-name-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: baseline;
        }

        .store-name {
          font-size: 16px;
          font-weight: 600;
        }

        .store-handle {
          font-size: 12px;
          color: var(--text-sub);
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .store-meta-row {
          font-size: 11px;
          color: var(--text-sub);
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .store-stats-row {
          font-size: 11px;
          color: var(--text-sub);
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }

        /* ★ mypage と同じ「押せる」見た目 */
        .stat-link {
          border: none;
          background: none;
          padding: 0;
          margin: 0;
          color: var(--text-sub);
          font-size: 11px;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .stat-link strong {
          color: var(--text-main);
          font-weight: 700;
          margin-left: 2px;
        }
        .stat-link:disabled {
          cursor: default;
          opacity: 0.5;
          text-decoration: none;
        }

        .store-hero-lead {
          font-size: 13px;
          line-height: 1.7;
          margin-top: 6px;
          color: var(--text-main);
        }

        .store-avatar {
          border: 1px solid rgba(0, 0, 0, 0.08);
        }

        .store-card {
          margin-bottom: 12px;
        }

        .store-section-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-sub);
          margin-bottom: 6px;
        }

        .store-links {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin: 6px 0 4px;
        }

        .store-link-btn {
          width: 100%;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 13px;
          font-weight: 500;
          border: none;
          cursor: pointer;
          text-align: center;
          text-decoration: none;
          background: var(--accent);
          color: #fff;
          box-shadow: 0 2px 6px rgba(215, 185, 118, 0.45);
        }

        .store-link-btn--ghost {
          background: var(--surface-soft);
          color: var(--text-main);
          border: 1px solid var(--border);
          box-shadow: none;
        }

        .store-caption {
          font-size: 11px;
          color: var(--text-sub);
          margin-top: 4px;
          line-height: 1.6;
        }

        .therapist-list {
          list-style: none;
          padding: 0;
          margin: 4px 0 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .therapist-item {
          margin: 0;
        }

        .therapist-link {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          color: inherit;
          text-decoration: none;
        }

        .therapist-avatar {
          width: 40px;
          height: 40px;
        }

        .therapist-item-main {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .therapist-item-name {
          font-size: 13px;
          font-weight: 500;
        }

        .therapist-item-id {
          font-size: 11px;
          color: var(--text-sub);
        }

        .edit-inline-btn {
          margin-left: 6px;
          font-size: 14px;
          opacity: 0.8;
        }

        .edit-inline-btn:hover {
          opacity: 1;
        }

        .feed-avatar {
          border: 1px solid rgba(0, 0, 0, 0.08);
        }

        .feed-item {
          border-bottom: 1px solid rgba(0, 0, 0, 0.04);
          padding: 10px 16px;
          cursor: pointer;
        }

        .feed-item:focus {
          outline: 2px solid rgba(0, 0, 0, 0.18);
          outline-offset: 2px;
          border-radius: 8px;
        }

        :global(.no-link-style) {
          color: inherit;
          text-decoration: none;
        }
      `}</style>
    </div>
  );
};

export default StoreProfilePage;