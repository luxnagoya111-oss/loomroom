// app/store/[id]/page.tsx
"use client";

import React, { useEffect, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { makeThreadId } from "@/lib/dmThread";
import { getCurrentUserId } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import { timeAgo } from "@/lib/timeAgo";

import {
  getRelation,
  setRelation as setRelationOnServer,
  toRelationFlags,
  type RelationFlags,
} from "@/lib/repositories/relationRepository";

import {
  getRelationFlags as getLocalRelationFlags,
  setRelation as setLocalRelation,
} from "@/lib/relationStorage";

import type { UserId } from "@/types/user";
import { RelationActions } from "@/components/RelationActions";

// ==============================
// 型定義（Supabase から取る最低限）
// ==============================
type DbStoreRow = {
  id: string;
  owner_user_id: string | null;
  name: string | null; // 店名
  area: string | null; // エリア
  description: string | null; // 紹介文
  website_url?: string | null;
  x_url?: string | null;
  twicas_url?: string | null;
  line_url?: string | null;
};

type DbUserRow = {
  id: string;
  name: string | null; // ハンドル名（@xxx の中身）
  avatar_url: string | null;
};

type DbPostRow = {
  id: string;
  author_id: string | null;
  body: string | null;
  area: string | null;
  created_at: string;
};

// ★ 在籍セラピスト（therapistsテーブル）表示用
type DbTherapistRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

// relations は users.id（uuid）で持つ前提
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

// 未読バッジは固定デモ
const hasUnread = true;

const STORE_STORAGE_PREFIX = "loomroom_store_profile_";
const THERAPIST_STORAGE_PREFIX = "loomroom_therapist_profile_";

type MembershipStatus = "pending" | "approved" | "rejected" | "left";

type TherapistMember = {
  therapistId: string;
  status: MembershipStatus;
};

type StoreLocalProfile = {
  therapistIdsText?: string; // 旧仕様
  members?: TherapistMember[]; // 新仕様：在籍リスト
  avatarDataUrl?: string; // 店舗アイコン（ローカル）
};

type TherapistLocalProfile = {
  displayName?: string;
  avatarDataUrl?: string;
};

type StorePost = {
  id: string;
  body: string;
  timeAgo: string;
  areaLabel: string | null;
};

// 店舗IDごとのエリアラベル（DBに area が無い場合のフォールバック）
const AREA_LABEL_MAP: Record<string, string> = {
  lux: "中部（名古屋・東海エリア）",
  tokyo: "関東（東京近郊）",
  osaka: "近畿（大阪・京都など）",
};

const StoreProfilePage: React.FC = () => {
  const params = useParams<{ id: string }>();
  // URL の [id] は基本的に stores.id（UUID）を想定
  const storeId = (params?.id as string) || "store";

  // 旧 slug 時代のフォールバック（areaラベルなど）
  const fallbackSlug =
    storeId === "lux" || storeId === "loomroom" ? storeId : "lux";

  const initialStoreName =
    fallbackSlug === "lux"
      ? "LuX nagoya"
      : fallbackSlug === "loomroom"
      ? "LoomRoom"
      : "LoomRoom 提携サロン";

  const initialAreaLabel =
    AREA_LABEL_MAP[fallbackSlug] || "全国（オンライン案内中心）";

  // ==============================
  // プロフィール（DB＋ローカル）の state
  // ==============================
  const [storeName, setStoreName] = useState<string>(initialStoreName);
  const [storeHandle, setStoreHandle] = useState<string>(`@${fallbackSlug}`);
  const [areaLabel, setAreaLabel] = useState<string>(initialAreaLabel);
  const [storeProfileText, setStoreProfileText] = useState<string | null>(null);

  const [websiteUrl, setWebsiteUrl] = useState<string | null>(null);
  const [xUrl, setXUrl] = useState<string | null>(null);
  const [twicasUrl, setTwicasUrl] = useState<string | null>(null);
  const [lineUrl, setLineUrl] = useState<string | null>(null);

  const [loadingProfile, setLoadingProfile] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // 店舗オーナーの users.id（uuid）を relations 用に保持
  const [storeOwnerUserId, setStoreOwnerUserId] = useState<string | null>(null);

  // ==============================
  // ★ FIX: 自分判定（users.id === stores.owner_user_id）
  // ==============================
  const isOwner =
    !!currentUserId &&
    !!storeOwnerUserId &&
    currentUserId === storeOwnerUserId;

  // ==============================
  // ★ FIX: DMスレッドは「自分(users.id) × 店舗オーナー(users.id)」で作る
  // （自分のページでは threadId を作らない）
  // ==============================
  const threadId =
    currentUserId && storeOwnerUserId && !isOwner
      ? makeThreadId(currentUserId, storeOwnerUserId)
      : null;

  const [relations, setRelations] = useState<RelationFlags>({
    following: false,
    muted: false,
    blocked: false,
  });

  // ★ therapistsテーブル（display_name / avatar_url）で表示する
  const [therapists, setTherapists] = useState<
    { id: string; display_name: string; avatar_url?: string | null }[]
  >([]);

  const [storeAvatarDataUrl, setStoreAvatarDataUrl] = useState<
    string | undefined
  >(undefined);

  const [likes, setLikes] = useState<Record<string, boolean>>({});

  const [posts, setPosts] = useState<StorePost[]>([]);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [loadingPosts, setLoadingPosts] = useState<boolean>(false);

  // 在籍申請用
  const [canApplyMembership, setCanApplyMembership] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyDone, setApplyDone] = useState(false);

  // currentUserId をクライアント側で初期化
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = getCurrentUserId(); // ゲスト時は guest-xxxx の可能性あり
    setCurrentUserId(id);
  }, []);

  // relation の復元：Supabase or localStorage
  useEffect(() => {
    if (!currentUserId) return;

    // 1) Supabase: uuid 会員同士なら relations テーブルから
    if (isUuid(currentUserId) && isUuid(storeOwnerUserId)) {
      if (currentUserId === storeOwnerUserId) return;

      let cancelled = false;

      (async () => {
        const row = await getRelation(
          currentUserId as UserId,
          storeOwnerUserId as UserId
        );
        if (cancelled) return;
        setRelations(toRelationFlags(row));
      })();

      return () => {
        cancelled = true;
      };
    }

    // 2) それ以外（guest 等）は旧ローカルストレージ版で復元
    const localTargetId = (storeOwnerUserId ?? storeId) as UserId;

    if (currentUserId !== (storeOwnerUserId ?? storeId)) {
      const flags = getLocalRelationFlags(currentUserId as UserId, localTargetId);
      setRelations(flags);
    }
  }, [currentUserId, storeOwnerUserId, storeId]);

  // ==============================
  // 在籍申請ボタン表示判定
  // ==============================
  useEffect(() => {
    let cancelled = false;

    const checkEligibility = async () => {
      // 未ログイン or uuid でない → 出さない
      if (!currentUserId || !isUuid(currentUserId)) {
        setCanApplyMembership(false);
        return;
      }

      // 店舗オーナー自身 → 出さない
      if (currentUserId === storeOwnerUserId) {
        setCanApplyMembership(false);
        return;
      }

      // therapist か確認
      const { data: userRow } = await supabase
        .from("users")
        .select("role")
        .eq("id", currentUserId)
        .maybeSingle();

      if (cancelled || userRow?.role !== "therapist") {
        setCanApplyMembership(false);
        return;
      }

      // therapist 未所属か確認（store_id が NULL なら申請可）
      const { data: therapistRow } = await supabase
        .from("therapists")
        .select("store_id")
        .eq("user_id", currentUserId)
        .maybeSingle();

      if (cancelled) return;

      if (therapistRow && therapistRow.store_id == null) {
        setCanApplyMembership(true);
      } else {
        setCanApplyMembership(false);
      }
    };

    checkEligibility();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, storeOwnerUserId]);

  // ==============================
  // フォロー / ミュート / ブロック
  // ==============================
  const handleToggleFollow = async () => {
    if (!currentUserId) return;

    const nextEnabled = !relations.following;

    // 1) Supabase 版
    if (isUuid(currentUserId) && isUuid(storeOwnerUserId)) {
      if (currentUserId === storeOwnerUserId) return;

      const ok = await setRelationOnServer({
        userId: currentUserId as UserId,
        targetId: storeOwnerUserId as UserId,
        type: nextEnabled ? "follow" : null,
      });
      if (!ok) return;

      setRelations({
        following: nextEnabled,
        muted: false,
        blocked: false,
      });
      return;
    }

    // 2) ローカル版（guest 等）
    const localTargetId = (storeOwnerUserId ?? storeId) as UserId;

    if (currentUserId !== (storeOwnerUserId ?? storeId)) {
      const updated = setLocalRelation(
        currentUserId as UserId,
        localTargetId,
        "follow",
        nextEnabled
      );
      setRelations(updated);
    }
  };

  const handleToggleMute = async () => {
    if (!currentUserId) return;

    const nextEnabled = !relations.muted;

    // 1) Supabase 版
    if (isUuid(currentUserId) && isUuid(storeOwnerUserId)) {
      if (currentUserId === storeOwnerUserId) return;

      const ok = await setRelationOnServer({
        userId: currentUserId as UserId,
        targetId: storeOwnerUserId as UserId,
        type: nextEnabled ? "mute" : null,
      });
      if (!ok) return;

      setRelations({
        following: false,
        muted: nextEnabled,
        blocked: false,
      });
      return;
    }

    // 2) ローカル版
    const localTargetId = (storeOwnerUserId ?? storeId) as UserId;

    if (currentUserId !== (storeOwnerUserId ?? storeId)) {
      const updated = setLocalRelation(
        currentUserId as UserId,
        localTargetId,
        "mute",
        nextEnabled
      );
      setRelations(updated);
    }
  };

  const handleToggleBlock = async () => {
    if (!currentUserId) return;

    const nextEnabled = !relations.blocked;

    if (nextEnabled) {
      const ok = window.confirm(
        "この店舗アカウントをブロックしますか？\nタイムラインやDMからも非表示になります。"
      );
      if (!ok) return;
    }

    // 1) Supabase 版
    if (isUuid(currentUserId) && isUuid(storeOwnerUserId)) {
      if (currentUserId === storeOwnerUserId) return;

      const ok = await setRelationOnServer({
        userId: currentUserId as UserId,
        targetId: storeOwnerUserId as UserId,
        type: nextEnabled ? "block" : null,
      });
      if (!ok) return;

      setRelations({
        following: false,
        muted: false,
        blocked: nextEnabled,
      });
      return;
    }

    // 2) ローカル版
    const localTargetId = (storeOwnerUserId ?? storeId) as UserId;

    if (currentUserId !== (storeOwnerUserId ?? storeId)) {
      const updated = setLocalRelation(
        currentUserId as UserId,
        localTargetId,
        "block",
        nextEnabled
      );
      setRelations(updated);
    }
  };

  // ==============================
  // Supabase から店舗プロフィール＋投稿取得
  // ==============================
  useEffect(() => {
    let cancelled = false;

    const fetchProfileAndPosts = async () => {
      try {
        setLoadingProfile(true);
        setProfileError(null);
        setLoadingPosts(true);
        setPostsError(null);

        // 1) stores テーブルから店舗情報
        const { data: storeRow, error: sError } = await supabase
          .from("stores")
          .select(
            "id, owner_user_id, name, area, description, website_url, x_url, twicas_url, line_url"
          )
          .eq("id", storeId)
          .maybeSingle<DbStoreRow>();

        if (cancelled) return;

        if (sError) {
          console.error("Supabase store fetch error:", sError);
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

        // 店名
        if (row.name && row.name.trim().length > 0) {
          setStoreName(row.name.trim());
        }

        // エリア
        if (row.area && row.area.trim().length > 0) {
          setAreaLabel(row.area.trim());
        }

        // 紹介文
        if (row.description && row.description.trim().length > 0) {
          setStoreProfileText(row.description);
        }

        // 公式リンク
        if (row.website_url && row.website_url.trim().length > 0) {
          setWebsiteUrl(row.website_url.trim());
        }
        if (row.x_url && row.x_url.trim().length > 0) {
          setXUrl(row.x_url.trim());
        }
        if (row.twicas_url && row.twicas_url.trim().length > 0) {
          setTwicasUrl(row.twicas_url.trim());
        }
        if (row.line_url && row.line_url.trim().length > 0) {
          setLineUrl(row.line_url.trim());
        }

        // relations 用に、owner_user_id（= users.id / uuid）を保持
        setStoreOwnerUserId(row.owner_user_id ?? null);

        // 2) 紐づく users からハンドル名・アイコン（owner_user_id）
        if (row.owner_user_id) {
          const { data: userRow, error: uError } = await supabase
            .from("users")
            .select("id, name, avatar_url")
            .eq("id", row.owner_user_id)
            .maybeSingle<DbUserRow>();

          if (cancelled) return;

          if (uError) {
            console.error("Supabase user(fetch for store) error:", uError);
          } else if (userRow) {
            const u = userRow as DbUserRow;

            if (u.name && u.name.trim().length > 0) {
              setStoreHandle(`@${u.name.trim()}`);
            }

            if (!storeAvatarDataUrl && u.avatar_url) {
              setStoreAvatarDataUrl(u.avatar_url);
            }
          }

          // 3) posts 取得（author_id = owner_user_id）
          const { data: postRows, error: pError } = await supabase
            .from("posts")
            .select("id, author_id, body, area, created_at")
            .eq("author_id", row.owner_user_id)
            .order("created_at", { ascending: false })
            .limit(50);

          if (cancelled) return;

          if (pError) {
            console.error("Supabase store posts error:", pError);
            setPostsError(
              (pError as any)?.message ??
                "お店の投稿の取得に失敗しました。時間をおいて再度お試しください。"
            );
            setPosts([]);
          } else {
            const postsMapped: StorePost[] = (postRows ?? []).map((r: any) => ({
              id: (r as DbPostRow).id,
              body: (r as DbPostRow).body ?? "",
              timeAgo: timeAgo((r as DbPostRow).created_at),
              areaLabel: (r as DbPostRow).area ?? null,
            }));
            setPosts(postsMapped);
          }
        } else {
          setPosts([]);
        }
      } catch (e: any) {
        if (cancelled) return;
        console.error("Supabase store(fetch) unexpected error:", e);
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

    fetchProfileAndPosts();

    return () => {
      cancelled = true;
    };
  }, [storeId, storeAvatarDataUrl]);

  // ==============================
  // 在籍セラピスト（DB → fallbackでlocalStorage）
  // ==============================
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // 1) DB（正）：therapists テーブルの display_name / avatar_url を使う
      try {
        const { data, error } = await supabase
          .from("therapists")
          .select("id, display_name, avatar_url, store_id")
          .eq("store_id", storeId);

        if (cancelled) return;
        if (error) throw error;

        const rows = (data ?? []).map((t: any) => ({
          id: (t as DbTherapistRow).id,
          display_name:
            ((t as DbTherapistRow).display_name ?? "").trim() || (t as DbTherapistRow).id,
          avatar_url: (t as DbTherapistRow).avatar_url ?? null,
        }));

        setTherapists(rows);
        return;
      } catch (e) {
        console.warn(
          "[store page] therapists db load failed, fallback to localStorage",
          e
        );
      }

      // 2) fallback: localStorage
      if (typeof window === "undefined") return;

      try {
        const storeKey = `${STORE_STORAGE_PREFIX}${storeId}`;
        const rawStore = window.localStorage.getItem(storeKey);

        if (!rawStore) {
          setTherapists([]);
          return;
        }

        const storeProfile = JSON.parse(rawStore) as StoreLocalProfile;

        // 店舗アイコン（ローカル設定があれば Supabase より優先）
        if (storeProfile.avatarDataUrl) {
          setStoreAvatarDataUrl(storeProfile.avatarDataUrl);
        }

        let members: TherapistMember[] = Array.isArray(storeProfile.members)
          ? storeProfile.members
          : [];

        if ((!members || members.length === 0) && storeProfile.therapistIdsText) {
          const ids = storeProfile.therapistIdsText
            .split(/\r?\n|,|、|\s+/)
            .map((s) => s.trim())
            .filter(Boolean);

          members = ids.map((id) => ({
            therapistId: id,
            status: "approved",
          }));
        }

        const approvedIds = members
          .filter((m) => m.status === "approved")
          .map((m) => m.therapistId);

        const result: { id: string; display_name: string; avatar_url?: string | null }[] =
          [];

        approvedIds.forEach((id) => {
          const tKey = `${THERAPIST_STORAGE_PREFIX}${id}`;
          const rawTherapist = window.localStorage.getItem(tKey);

          if (rawTherapist) {
            try {
              const t = JSON.parse(rawTherapist) as TherapistLocalProfile;
              result.push({
                id,
                display_name: t.displayName?.trim() ? t.displayName.trim() : id,
                avatar_url: t.avatarDataUrl ?? null,
              });
            } catch {
              result.push({ id, display_name: id, avatar_url: null });
            }
          } else {
            result.push({ id, display_name: id, avatar_url: null });
          }
        });

        setTherapists(result);
      } catch (e) {
        console.warn("Failed to load store memberships", e);
        setTherapists([]);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const storeInitial =
    storeName && storeName.trim().length > 0
      ? storeName.trim().charAt(0).toUpperCase()
      : "?";

  const avatarStyle: CSSProperties = storeAvatarDataUrl
    ? {
        backgroundImage: `url(${storeAvatarDataUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {};

  const toggleLike = (postId: string) => {
    setLikes((prev: Record<string, boolean>) => ({
      ...prev,
      [postId]: !prev[postId],
    }));
  };

  // ★ フォローUIは「自分（オーナー）」なら非表示
  const canShowRelationUi =
    !!currentUserId && !!storeOwnerUserId && !isOwner;

  return (
    <div className="app-shell">
      <AppHeader title={storeName} subtitle={storeHandle} />

      <main className="app-main">
        {profileError && (
          <div
            style={{
              padding: "4px 12px",
              fontSize: 11,
              color: "#b00020",
            }}
          >
            店舗情報の読み込みに失敗しました：{profileError}
          </div>
        )}

        <section className="store-hero">
          <div className="store-hero-row">
            <div className="avatar-circle store-avatar" style={avatarStyle}>
              {!storeAvatarDataUrl && (
                <span className="avatar-circle-text">{storeInitial}</span>
              )}
            </div>

            <div className="store-hero-main">
              <div className="store-name-row">
                <span className="store-name">{storeName}</span>
                <span className="store-handle">
                  {storeHandle}

                  {/* 自分の店舗ページでは ✉ を出さない */}
                  {!isOwner && threadId && (
                    <Link
                      href={`/messages/${threadId}`}
                      className="dm-inline-btn no-link-style"
                    >
                      ✉
                    </Link>
                  )}

                  {currentUserId &&
                    storeOwnerUserId &&
                    currentUserId === storeOwnerUserId && (
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

              <div className="store-stats-row">
                <span>
                  投稿 <strong>{posts.length}</strong>
                </span>
                <span>
                  在籍セラピスト <strong>{therapists.length}</strong>
                </span>
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
                    onClick={async () => {
                      try {
                        setApplyLoading(true);

                        const res = await fetch("/api/therapist-store-requests", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ store_id: storeId }),
                        });

                        const json = await res.json();

                        if (!res.ok) {
                          // すでに申請済みは成功扱い
                          if (
                            typeof json?.error === "string" &&
                            json.error.includes("already pending")
                          ) {
                            setApplyDone(true);
                            return;
                          }
                          throw new Error(json?.error || "申請に失敗しました");
                        }

                        setApplyDone(true);
                      } catch (e: any) {
                        alert(e.message ?? "在籍申請に失敗しました");
                      } finally {
                        setApplyLoading(false);
                      }
                    }}
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

          <p className="store-hero-lead">
            {storeProfileText && storeProfileText.trim().length > 0
              ? storeProfileText.split("\n").map((line, idx, arr) => (
                  <React.Fragment key={idx}>
                    {line}
                    {idx < arr.length - 1 && <br />}
                  </React.Fragment>
                ))
              : null}
          </p>
        </section>

        {/* 在籍セラピスト一覧 */}
        <section className="surface-card store-card">
          <h2 className="store-section-title">在籍セラピスト</h2>

          {therapists.length === 0 ? (
            <p className="store-caption">
              まだ LoomRoom 上では在籍セラピストが登録されていません。
            </p>
          ) : (
            <ul className="therapist-list">
              {therapists.map((t) => {
                const name = (t.display_name || t.id || "").trim();
                const initial = name ? name.charAt(0).toUpperCase() : "?";

                return (
                  <li
                    key={t.id}
                    className="therapist-item"
                    onClick={() => (window.location.href = `/therapist/${t.id}`)}
                  >
                    <div
                      className="avatar-circle therapist-avatar"
                      style={
                        t.avatar_url
                          ? {
                              backgroundImage: `url(${t.avatar_url})`,
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                            }
                          : {}
                      }
                    >
                      {!t.avatar_url && (
                        <span className="avatar-circle-text">{initial}</span>
                      )}
                    </div>

                    <div className="therapist-item-main">
                      <div className="therapist-item-name">{t.display_name}</div>
                      <div className="therapist-item-id">@{t.id}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 公式リンク（Supabaseのカラムから） */}
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
            ※ 上記リンクは LoomRoom 外のサービスです。各サービスごとの利用規約・ポリシーをご確認のうえご利用ください。
          </p>
        </section>

        {/* お店の発信（postsテーブルベース） */}
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
                  <div key={p.id} className="feed-item">
                    <div className="feed-item-inner">
                      <div className="avatar" style={avatarStyle} aria-hidden="true">
                        {!storeAvatarDataUrl && (
                          <span className="avatar-fallback">{storeInitial}</span>
                        )}
                      </div>

                      <div className="feed-main">
                        <div className="feed-header">
                          <div className="feed-name-row">
                            <span className="post-name">{storeName}</span>
                            <span className="post-username">{storeHandle}</span>
                          </div>
                          <div className="post-meta">
                            <span>{p.areaLabel ? p.areaLabel : areaLabel}</span>
                            <span>・</span>
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
                  </div>
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
        }

        .store-hero-lead {
          font-size: 13px;
          line-height: 1.7;
          margin-top: 6px;
          color: var(--text-main);
        }

        .store-avatar {
          width: 48px;
          height: 48px;
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
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
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

      .avatar {
        width: 38px;
        height: 38px;
        border-radius: 999px;
        border: 1px solid rgba(0, 0, 0, 0.08);
        background: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 38px;
        overflow: hidden;
      }

      .avatar-fallback {
        font-size: 13px;
        font-weight: 700;
        color: var(--text-sub);
      }  
      `}</style>
    </div>
  );
};

export default StoreProfilePage;