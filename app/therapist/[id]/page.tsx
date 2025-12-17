// app/therapist/[id]/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

import AvatarCircle from "@/components/AvatarCircle";
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
import type { UserId } from "@/types/user";
import { RelationActions } from "@/components/RelationActions";

import type { DbTherapistRow, DbUserRow, DbPostRow, DbStoreRow } from "@/types/db";

type Area =
  | "北海道"
  | "東北"
  | "関東"
  | "中部"
  | "近畿"
  | "中国"
  | "四国"
  | "九州"
  | "沖縄";

const KNOWN_AREAS: Area[] = [
  "北海道",
  "東北",
  "関東",
  "中部",
  "近畿",
  "中国",
  "四国",
  "九州",
  "沖縄",
];

function toArea(value: string | null | undefined): Area | "" {
  if (!value) return "";
  const trimmed = value.trim() as Area;
  return KNOWN_AREAS.includes(trimmed) ? trimmed : "";
}

// ===== uuid 判定（relations は users.id = uuid で運用する）=====
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

// ===== Avatar URL 正規化（Home と同一思想で統一）=====
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
 * - 空
 * - ".../public/avatars" で終わってる（ファイル名なし）等
 */
function looksValidAvatarUrl(v: string | null | undefined): boolean {
  const s = (v ?? "").trim();
  if (!s) return false;

  // 例: https://xxxx.supabase.co/storage/v1/object/public/avatars
  // これだと画像ではないので弾く
  if (s.includes("/storage/v1/object/public/avatars")) {
    if (/\/public\/avatars\/?$/i.test(s)) return false;
  }

  return true;
}

/**
 * avatar_url が
 * - https://... ならそのまま
 * - それ以外（storage path）なら public URL に変換
 */
function resolveAvatarUrl(raw: string | null | undefined): string | null {
  const v = normalizeAvatarUrl(raw);
  if (!v) return null;
  if (isProbablyHttpUrl(v)) return v;

  // "avatars/xxx.png" のような場合にも対応（先頭の "avatars/" を外す）
  const path = v.startsWith(`${AVATAR_BUCKET}/`)
    ? v.slice(AVATAR_BUCKET.length + 1)
    : v;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

type TherapistProfile = {
  displayName: string;
  handle: string;
  area: Area | "";
  intro: string;
  avatarUrl?: string | null;

  snsX?: string;
  snsLine?: string;
  snsOther?: string;
};

type TherapistPost = {
  id: string;
  body: string;
  area: Area | "";
  timeAgo: string;
};

type LinkedStoreInfo = {
  id: string;
  name: string;
  area?: string | null;
  avatarUrl?: string | null;
  websiteUrl?: string | null;
  lineUrl?: string | null;
};

const TherapistProfilePage: React.FC = () => {
  const router = useRouter();

  const params = useParams<{ id: string }>();
  const therapistId = (params?.id as string) || ""; // therapists.id

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  // therapists.user_id（= users.id / uuid）
  const [therapistUserId, setTherapistUserId] = useState<string | null>(null);

  // 所属店舗ID（store_id）
  const [linkedStoreId, setLinkedStoreId] = useState<string | null>(null);
  const isStoreLinked = !!linkedStoreId;

  // 在籍店舗表示用
  const [linkedStore, setLinkedStore] = useState<LinkedStoreInfo | null>(null);
  const [loadingStore, setLoadingStore] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);

  // ★「自分のページ」判定は Supabase Auth を正とする
  const isOwner =
    !!authUserId && !!therapistUserId && authUserId === therapistUserId;

  // ★ DM threadId は uuid を優先して作る
  const viewerIdForThread = authUserId ?? currentUserId;
  const targetIdForThread = therapistUserId ?? therapistId;

  const threadId =
    viewerIdForThread &&
    targetIdForThread &&
    viewerIdForThread !== targetIdForThread
      ? makeThreadId(viewerIdForThread, targetIdForThread)
      : null;

  const [relations, setRelations] = useState<RelationFlags>({
    following: false,
    muted: false,
    blocked: false,
  });

  const [profile, setProfile] = useState<TherapistProfile>({
    displayName: "",
    handle: "",
    area: "",
    intro: "",
    avatarUrl: null,
    snsX: "",
    snsLine: "",
    snsOther: "",
  });

  const [loadingProfile, setLoadingProfile] = useState<boolean>(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [posts, setPosts] = useState<TherapistPost[]>([]);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [loadingPosts, setLoadingPosts] = useState<boolean>(false);

  // currentUserId / authUserId を初期化
  useEffect(() => {
    if (typeof window === "undefined") return;

    setCurrentUserId(getCurrentUserId());

    supabase.auth
      .getUser()
      .then(({ data }) => setAuthUserId(data.user?.id ?? null))
      .catch(() => setAuthUserId(null));
  }, []);

  // relation の復元（自分のページは無効）
  useEffect(() => {
    if (isOwner) {
      setRelations({ following: false, muted: false, blocked: false });
      return;
    }
    if (!currentUserId) return;

    // ★ relations は uuid 会員同士のみ
    if (isUuid(authUserId) && isUuid(therapistUserId)) {
      if (authUserId === therapistUserId) return;

      let cancelled = false;
      (async () => {
        const row = await getRelation(
          authUserId as UserId,
          therapistUserId as UserId
        );
        if (cancelled) return;
        setRelations(toRelationFlags(row));
      })();

      return () => {
        cancelled = true;
      };
    }

    // guest / 非uuid は relations を使わない
    setRelations({ following: false, muted: false, blocked: false });
  }, [currentUserId, authUserId, therapistUserId, isOwner]);

  // ===== フォロー / ミュート / ブロック（uuid会員同士のみ）=====
  const handleToggleFollow = async () => {
    if (isOwner) return;
    if (!isUuid(authUserId) || !isUuid(therapistUserId)) return;

    const nextEnabled = !relations.following;

    const ok = await setRelationOnServer({
      userId: authUserId as UserId,
      targetId: therapistUserId as UserId,
      type: nextEnabled ? "follow" : null,
    });
    if (!ok) return;

    setRelations({ following: nextEnabled, muted: false, blocked: false });
  };

  const handleToggleMute = async () => {
    if (isOwner) return;
    if (!isUuid(authUserId) || !isUuid(therapistUserId)) return;

    const nextEnabled = !relations.muted;

    const ok = await setRelationOnServer({
      userId: authUserId as UserId,
      targetId: therapistUserId as UserId,
      type: nextEnabled ? "mute" : null,
    });
    if (!ok) return;

    setRelations({ following: false, muted: nextEnabled, blocked: false });
  };

  const handleToggleBlock = async () => {
    if (isOwner) return;
    if (!isUuid(authUserId) || !isUuid(therapistUserId)) return;

    const nextEnabled = !relations.blocked;

    if (nextEnabled) {
      const ok = window.confirm(
        "このセラピストをブロックしますか？\nタイムラインやDMからも非表示になります。"
      );
      if (!ok) return;
    }

    const ok = await setRelationOnServer({
      userId: authUserId as UserId,
      targetId: therapistUserId as UserId,
      type: nextEnabled ? "block" : null,
    });
    if (!ok) return;

    setRelations({ following: false, muted: false, blocked: nextEnabled });
  };

  // ▼ Supabase から therapists / users / posts を取得
  useEffect(() => {
    let cancelled = false;

    const fetchProfileAndPosts = async () => {
      if (!therapistId) {
        setProfileError("セラピストIDが取得できませんでした。URLをご確認ください。");
        setLoadingProfile(false);
        return;
      }

      try {
        setLoadingProfile(true);
        setProfileError(null);
        setLoadingPosts(true);
        setPostsError(null);

        // 1) therapists
        const { data: therapist, error: tError } = await supabase
          .from("therapists")
          .select("id, user_id, store_id, display_name, area, profile, avatar_url")
          .eq("id", therapistId)
          .maybeSingle<DbTherapistRow>();

        if (cancelled) return;

        if (tError) {
          console.error("[TherapistProfile] therapist fetch error:", tError);
          setProfileError(
            (tError as any)?.message ?? "セラピスト情報の取得に失敗しました。"
          );
          setLoadingProfile(false);
          setLoadingPosts(false);
          return;
        }

        if (!therapist) {
          setProfileError("セラピスト情報が見つかりませんでした。");
          setLoadingProfile(false);
          setLoadingPosts(false);
          return;
        }

        setTherapistUserId(therapist.user_id);
        setLinkedStoreId(therapist.store_id);

        // 2) users（handle用 + avatar優先用）
        let user: DbUserRow | null = null;
        if (therapist.user_id) {
          const { data: userRow, error: uError } = await supabase
            .from("users")
            .select("id, name, avatar_url")
            .eq("id", therapist.user_id)
            .maybeSingle<DbUserRow>();

          if (!cancelled) {
            if (uError) {
              console.error("[TherapistProfile] user fetch error:", uError);
            } else {
              user = userRow;
            }
          }
        }

        if (cancelled) return;

        const displayName =
          therapist.display_name?.trim().length ? therapist.display_name : "";

        const handle =
          user?.name && user.name.trim().length ? `@${user.name.trim()}` : "";

        const area = toArea(therapist.area);

        const intro =
          therapist.profile && therapist.profile.trim().length
            ? therapist.profile
            : "";

        // avatar: users.avatar_url 優先 → therapists.avatar_url
        const rawAvatar =
          (user as any)?.avatar_url ?? (therapist as any)?.avatar_url ?? null;

        const avatarUrl = looksValidAvatarUrl(rawAvatar)
          ? resolveAvatarUrl(rawAvatar)
          : null;

        setProfile((prev) => ({
          ...prev,
          displayName,
          handle,
          area,
          intro,
          avatarUrl,
        }));

        setLoadingProfile(false);

        // 3) posts（このページの投稿は「users.id（uuid）」で author_id を持つ前提）
        if (therapist.user_id) {
          const { data: postRows, error: pError } = await supabase
            .from("posts")
            .select("id, author_id, body, area, created_at")
            .eq("author_id", therapist.user_id)
            .order("created_at", { ascending: false })
            .limit(50);

          if (cancelled) return;

          if (pError) {
            console.error("[TherapistProfile] posts fetch error:", pError);
            setPostsError(
              (pError as any)?.message ??
                "投稿の取得に失敗しました。時間をおいて再度お試しください。"
            );
            setPosts([]);
          } else {
            const rows = (postRows ?? []) as DbPostRow[];
            const mapped: TherapistPost[] = rows.map((row: DbPostRow) => {
              const a: Area | "" = KNOWN_AREAS.includes((row.area ?? "") as Area)
                ? ((row.area as Area) ?? "")
                : "";
              return {
                id: row.id,
                body: row.body ?? "",
                area: a,
                timeAgo: timeAgo(row.created_at),
              };
            });
            setPosts(mapped);
          }
        } else {
          setPosts([]);
        }
      } catch (e: any) {
        if (cancelled) return;
        console.error("[TherapistProfile] unexpected error:", e);
        setProfileError(e?.message ?? "不明なエラーが発生しました。");
        setPostsError(
          e?.message ??
            "投稿の取得中に不明なエラーが発生しました。時間をおいて再度お試しください。"
        );
      } finally {
        if (!cancelled) {
          setLoadingPosts(false);
          setLoadingProfile(false);
        }
      }
    };

    void fetchProfileAndPosts();

    return () => {
      cancelled = true;
    };
  }, [therapistId]);

  // ★ store_id がある場合のみ stores を取得（在籍表示用）
  useEffect(() => {
    let cancelled = false;

    const loadStore = async (sid: string) => {
      try {
        setLoadingStore(true);
        setStoreError(null);

        const { data, error } = await supabase
          .from("stores")
          .select("id, name, area, avatar_url, website_url, line_url")
          .eq("id", sid)
          .maybeSingle<DbStoreRow>();

        if (cancelled) return;

        if (error) {
          console.error("[TherapistProfile] store fetch error:", error);
          setStoreError((error as any)?.message ?? "店舗情報の取得に失敗しました。");
          setLinkedStore(null);
          return;
        }

        if (!data) {
          setLinkedStore(null);
          return;
        }

        const rawStoreAvatar = (data as any).avatar_url ?? null;

        setLinkedStore({
          id: data.id,
          name: (data as any).name ?? "店舗",
          area: (data as any).area ?? null,
          avatarUrl: looksValidAvatarUrl(rawStoreAvatar)
            ? resolveAvatarUrl(rawStoreAvatar)
            : null,
          websiteUrl: (data as any).website_url ?? null,
          lineUrl: (data as any).line_url ?? null,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error("[TherapistProfile] store unexpected error:", e);
        setStoreError(e?.message ?? "店舗情報の取得に失敗しました。");
        setLinkedStore(null);
      } finally {
        if (!cancelled) setLoadingStore(false);
      }
    };

    if (linkedStoreId) {
      void loadStore(linkedStoreId);
    } else {
      setLinkedStore(null);
      setStoreError(null);
      setLoadingStore(false);
    }

    return () => {
      cancelled = true;
    };
  }, [linkedStoreId]);

  // ★自分のページなら relation UI は出さない
  const canShowRelationUi = !isOwner;

  // DMボタンは「店舗に紐づいていて」「自分ではなく」「ブロックしていない」場合のみ
  const canShowDmButton =
    !!threadId && isStoreLinked && !relations.blocked && !isOwner;

  // 関連リンク（SNS）が空ならブロック自体を出さない
  const showSnsBlock = !!(profile.snsX || profile.snsLine || profile.snsOther);

  return (
    <>
      <div className="app-shell">
        <AppHeader
          title={profile.displayName || "セラピスト"}
          subtitle={profile.handle || ""}
          showBack={true}
        />

        <main className="app-main">
          <section className="profile-hero">
            <div className="profile-hero-row">
              <AvatarCircle
                avatarUrl={profile.avatarUrl}
                size={60}
                displayName={profile.displayName || profile.handle || "T"}
              />

              <div className="profile-hero-main">
                <div className="profile-name-row">
                  <span className="profile-name">
                    {profile.displayName || "名前未設定"}
                  </span>

                  <span className="profile-handle">
                    {profile.handle || ""}

                    {canShowDmButton && (
                      <Link
                        href={`/messages/new?to=${therapistUserId}`} // targetUserId = 相手の users.id(uuid)
                        className="dm-inline-btn no-link-style"
                      >
                        ✉
                      </Link>
                    )}

                    {isOwner && (
                      <Link
                        href={`/therapist/${therapistId}/console`}
                        className="edit-inline-btn no-link-style"
                      >
                        ✎
                      </Link>
                    )}
                  </span>
                </div>

                <div className="profile-meta-row">
                  {profile.area && <span>{profile.area}</span>}
                  <span>セラピスト</span>
                  {!isStoreLinked && (
                    <span className="profile-tag">
                      テスト参加中（店舗と紐づけ前）
                    </span>
                  )}
                </div>

                <div className="profile-stats-row">
                  <span>
                    投稿 <strong>{posts.length}</strong>
                  </span>
                  <span>
                    フォロー <strong>–</strong>
                  </span>
                  <span>
                    フォロワー <strong>–</strong>
                  </span>
                </div>

                {canShowRelationUi && (
                  <RelationActions
                    flags={relations}
                    onToggleFollow={handleToggleFollow}
                    onToggleMute={handleToggleMute}
                    onToggleBlock={handleToggleBlock}
                    onReport={() => {
                      alert(
                        "このプロフィールの通報を受け付けました（現在はテスト用です）。"
                      );
                    }}
                  />
                )}
              </div>
            </div>

            {!isStoreLinked && (
              <p className="profile-notice">
                このセラピストは現在テスト参加中です。店舗と紐づくまで、
                LoomRoomからのDMはご利用いただけません。
              </p>
            )}

            {loadingProfile && (
              <p className="profile-intro">プロフィールを読み込んでいます…</p>
            )}
            {profileError && (
              <p className="profile-intro" style={{ color: "#b00020" }}>
                {profileError}
              </p>
            )}
            {!loadingProfile && profile.intro && (
              <p className="profile-intro">{profile.intro}</p>
            )}

            {/* 関連リンク */}
            {showSnsBlock && (
              <div className="profile-sns-block">
                <div className="profile-sns-title">関連リンク</div>
                <div className="profile-sns-list">
                  {profile.snsX && (
                    <a
                      href={profile.snsX}
                      target="_blank"
                      rel="noreferrer"
                      className="profile-sns-chip"
                    >
                      X（旧Twitter）
                    </a>
                  )}
                  {profile.snsLine && (
                    <a
                      href={profile.snsLine}
                      target="_blank"
                      rel="noreferrer"
                      className="profile-sns-chip"
                    >
                      LINE
                    </a>
                  )}
                  {profile.snsOther && (
                    <a
                      href={profile.snsOther}
                      target="_blank"
                      rel="noreferrer"
                      className="profile-sns-chip"
                    >
                      その他のリンク
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* ★ 在籍店舗 */}
            {isStoreLinked && (
              <div className="linked-store-block">
                <div className="linked-store-title">在籍店舗</div>

                {loadingStore && (
                  <div className="linked-store-card">
                    <div className="linked-store-row">
                      <AvatarCircle size={46} fallbackText="…" className="store-avatar" />
                      <div className="linked-store-main">
                        <div className="linked-store-name">読み込み中…</div>
                        <div className="linked-store-meta">
                          店舗情報を取得しています
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {!loadingStore && storeError && (
                  <div className="linked-store-card">
                    <div className="linked-store-row">
                      <AvatarCircle size={46} fallbackText="!" className="store-avatar" />
                      <div className="linked-store-main">
                        <div className="linked-store-name">在籍店舗</div>
                        <div className="linked-store-meta" style={{ color: "#b00020" }}>
                          {storeError}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {!loadingStore && !storeError && linkedStore && (
                  <Link
                    href={`/store/${linkedStore.id}`}
                    className="linked-store-card linked-store-link-wrapper"
                  >
                    <div className="linked-store-row">
                      <AvatarCircle
                        avatarUrl={linkedStore.avatarUrl}
                        size={46}
                        displayName={linkedStore.name || "S"}
                        className="store-avatar"
                      />
                      <div className="linked-store-main">
                        <div className="linked-store-name">{linkedStore.name}</div>
                        <div className="linked-store-meta">
                          {linkedStore.area || "エリア未設定"}
                        </div>
                      </div>
                    </div>
                  </Link>
                )}

                {!loadingStore && !storeError && !linkedStore && (
                  <div className="linked-store-card">
                    <div className="linked-store-row">
                      <AvatarCircle size={46} fallbackText="S" className="store-avatar" />
                      <div className="linked-store-main">
                        <div className="linked-store-name">在籍店舗</div>
                        <div className="linked-store-meta">
                          在籍店舗が見つかりませんでした
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 投稿一覧 */}
          <section className="therapist-posts-section">
            <h2 className="profile-section-title">投稿</h2>

            {loadingPosts && <div className="empty-hint">投稿を読み込んでいます…</div>}
            {postsError && !loadingPosts && (
              <div className="empty-hint" style={{ color: "#b00020" }}>
                {postsError}
              </div>
            )}
            {!loadingPosts && !postsError && posts.length === 0 && (
              <div className="empty-hint">まだ投稿はありません。</div>
            )}

            {!loadingPosts && !postsError && posts.length > 0 && (
              <div className="feed-list">
                {posts.map((p) => (
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
                        avatarUrl={profile.avatarUrl}
                        size={38}
                        displayName={profile.displayName || profile.handle || "T"}
                      />

                      <div className="feed-main">
                        <div className="feed-header">
                          <div className="feed-name-row">
                            <span className="post-name">
                              {profile.displayName || "名前未設定"}
                            </span>
                            <span className="post-username">{profile.handle || ""}</span>
                          </div>
                          <div className="post-meta">
                            {p.area && <span>{p.area}</span>}
                            <span>・</span>
                            <span>{p.timeAgo}</span>
                          </div>
                        </div>

                        <div className="post-body">
                          {p.body.split("\n").map((line, idx) => (
                            <p key={idx}>
                              {line || <span style={{ opacity: 0.3 }}>　</span>}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>

        <BottomNav active="mypage" hasUnread={false} />
      </div>

      <style jsx>{`
        .profile-hero {
          padding: 4px 0 12px;
          border-bottom: 1px solid var(--border);
          margin-bottom: 8px;
        }

        .profile-hero-row {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-bottom: 8px;
        }

        .profile-hero-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .profile-name-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: baseline;
        }

        .profile-name {
          font-size: 16px;
          font-weight: 600;
        }

        .profile-handle {
          font-size: 12px;
          color: var(--text-sub);
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .profile-meta-row {
          font-size: 11px;
          color: var(--text-sub);
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }

        .profile-tag {
          padding: 3px 8px;
          border-radius: 999px;
          border: 1px solid var(--border-soft, rgba(0, 0, 0, 0.08));
          font-size: 10px;
          background: var(--surface-soft, rgba(255, 255, 255, 0.9));
        }

        .profile-stats-row {
          font-size: 11px;
          color: var(--text-sub);
          display: flex;
          gap: 10px;
        }

        .profile-intro {
          font-size: 13px;
          line-height: 1.7;
          margin-top: 6px;
        }

        .profile-notice {
          font-size: 11px;
          line-height: 1.6;
          margin-top: 4px;
          color: var(--text-sub);
        }

        .profile-sns-block {
          margin-top: 10px;
        }

        .profile-sns-title {
          font-size: 12px;
          color: var(--text-sub);
          margin-bottom: 4px;
        }

        .profile-sns-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .profile-sns-chip {
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-main);
          text-decoration: none;
        }

        .linked-store-block {
          margin-top: 12px;
        }

        .linked-store-title {
          font-size: 12px;
          color: var(--text-sub);
          margin-bottom: 6px;
        }

        .linked-store-card {
          border-radius: 16px;
          border: 1px solid var(--border-soft, rgba(0, 0, 0, 0.06));
          background: var(--surface-soft, rgba(255, 255, 255, 0.9));
          padding: 10px;
        }

        .linked-store-row {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .store-avatar {
          border: 1px solid rgba(0, 0, 0, 0.08);
        }

        .linked-store-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .linked-store-name {
          font-size: 13px;
          font-weight: 700;
          line-height: 1.2;
        }

        .linked-store-meta {
          font-size: 11px;
          color: var(--text-sub);
        }

        .linked-store-link-wrapper {
          text-decoration: none;
          color: inherit;
          cursor: pointer;
          transition: background-color 0.15s ease, box-shadow 0.15s ease;
          display: block;
        }

        .linked-store-link-wrapper:hover {
          background: rgba(0, 0, 0, 0.03);
        }

        .linked-store-link-wrapper:active {
          background: rgba(0, 0, 0, 0.06);
        }

        .therapist-posts-section {
          margin-top: 6px;
        }

        .profile-section-title {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 4px;
          color: var(--text-sub);
        }

        .empty-hint {
          font-size: 12px;
          color: var(--text-sub);
          line-height: 1.6;
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

        .feed-item-inner {
          display: flex;
          gap: 10px;
        }

        .feed-main {
          flex: 1;
          min-width: 0;
        }

        .feed-header {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
        }

        .feed-name-row {
          display: flex;
          align-items: baseline;
          gap: 6px;
          flex-wrap: wrap;
        }

        .post-name {
          font-weight: 600;
          font-size: 13px;
        }

        .post-username {
          font-size: 11px;
          color: var(--text-sub, #777777);
        }

        .post-meta {
          font-size: 11px;
          color: var(--text-sub, #777777);
          margin-top: 2px;
        }

        .post-body {
          font-size: 13px;
          line-height: 1.7;
          margin-top: 4px;
          margin-bottom: 4px;
        }

        .edit-inline-btn {
          margin-left: 6px;
          font-size: 14px;
          opacity: 0.8;
        }

        .edit-inline-btn:hover {
          opacity: 1;
        }

        :global(.no-link-style) {
          color: inherit;
          text-decoration: none;
        }
      `}</style>
    </>
  );
};

export default TherapistProfilePage;