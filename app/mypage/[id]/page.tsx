// app/mypage/[id]/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import AppHeader from "@/components/AppHeader";
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

const hasUnread = true;

// ★ IDごとにキーを分ける（旧localStorageデータ用）
const STORAGE_PREFIX = "loomroom_profile_v1_";

type Area =
  | ""
  | "北海道"
  | "東北"
  | "関東"
  | "中部"
  | "近畿"
  | "中国"
  | "四国"
  | "九州"
  | "沖縄";

type AccountType = "ゲスト" | "会員";

type UserProfile = {
  displayName: string;
  handle: string;
  area: Area;
  intro: string;
  messagePolicy: string;
  accountType: AccountType;
  snsX?: string;
  snsLine?: string;
  snsOther?: string;
  avatarDataUrl?: string;
  role?: "user" | "therapist" | "store";
};

const DEFAULT_PROFILE: UserProfile = {
  displayName: "あなた",
  handle: "@user",
  area: "",
  intro:
    "まだ自己紹介は書かれていません。ゆっくり整えていく予定のページです。",
  messagePolicy:
    "通知にすぐ気づけないこともあるので、ゆっくりペースでやりとりできたら嬉しいです。",
  accountType: "ゲスト",
  snsX: "",
  snsLine: "",
  snsOther: "",
};

// Supabase users
type DbUserRow = {
  id: string;
  name: string | null;
  role: "user" | "therapist" | "store" | null;
  avatar_url: string | null;
};

// therapists
type DbTherapistRow = {
  display_name: string | null;
  area: string | null;
  profile: string | null;
};

// stores
type DbStoreRow = {
  name: string | null;
  area: string | null;
  description: string | null;
};

// posts
type DbPostRow = {
  id: string;
  author_id: string | null;
  body: string | null;
  area: string | null;
  created_at: string;
};

type UserPost = {
  id: string;
  body: string;
  area: Area | "";
  timeAgo: string;
};

const knownAreas: Area[] = [
  "",
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

// ===== uuid 判定（relations は users.id = uuid で運用する）=====
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

const PublicMyPage: React.FC = () => {
  const params = useParams<{ id: string }>();
  const userId = (params?.id as string) || "user";

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const threadId =
    currentUserId && currentUserId !== userId
      ? makeThreadId(currentUserId, userId)
      : null;

  const storageKey = `${STORAGE_PREFIX}${userId}`;

  const [profile, setProfile] = useState<UserProfile>(() => ({
    ...DEFAULT_PROFILE,
    handle: `@${userId}`,
  }));
  const [loading, setLoading] = useState<boolean>(true);
  // ★追加：role別の実体ID（stores.id / therapists.id）を保持
  const [storeId, setStoreId] = useState<string | null>(null);
  const [therapistId, setTherapistId] = useState<string | null>(null);

  const [posts, setPosts] = useState<UserPost[]>([]);
  const [postError, setPostError] = useState<string | null>(null);
  const [loadingPosts, setLoadingPosts] = useState<boolean>(false);

  // ▼ relations 状態（フォロー / ミュート / ブロック）
  const [relations, setRelations] = useState<RelationFlags>({
    following: false,
    muted: false,
    blocked: false,
  });

  // currentUserId 初期化
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = getCurrentUserId();
    setCurrentUserId(id);
  }, []);

  // ▼ Supabase からプロフィール取得
useEffect(() => {
  let cancelled = false;

  const fetchProfile = async () => {
    try {
      setLoading(true);

      // ★ role 切替時に古いIDが残らないようリセット
      setTherapistId(null);
      setStoreId(null);

      // 1) users を取得
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id, name, role, avatar_url")
        .eq("id", userId)
        .maybeSingle();

      if (cancelled) return;

      if (userError) {
        console.error("Supabase users fetch error:", userError);
        return;
      }

      const u = user as DbUserRow | null;
      if (!u) return;

      let baseProfile: UserProfile = {
        ...DEFAULT_PROFILE,
        handle: `@${userId}`,
        displayName:
          u.name ??
          (u.role === "store"
            ? "店舗アカウント"
            : u.role === "therapist"
            ? "セラピスト"
            : "ユーザー"),
        accountType: "会員",
        role: (u.role as UserProfile["role"]) ?? "user",
        avatarDataUrl: u.avatar_url ?? undefined,
        area: "",
      };

      // 2) role に応じて therapists / stores も見る
      if (u.role === "therapist") {
        const { data: t, error: tError } = await supabase
          .from("therapists")
          .select("id, display_name, area, profile")
          .eq("user_id", userId)
          .maybeSingle();

        if (!cancelled && !tError && t) {
          const th = t as (DbTherapistRow & { id: string });

          // ★ therapistId を保持（console遷移などに使える）
          setTherapistId(th.id);

          const areaValue: Area = knownAreas.includes((th.area ?? "") as Area)
            ? ((th.area as Area) ?? "")
            : "";

          baseProfile = {
            ...baseProfile,
            displayName: th.display_name ?? baseProfile.displayName,
            area: areaValue,
            intro:
              th.profile && th.profile.trim().length > 0
                ? th.profile
                : baseProfile.intro,
          };
        }
      } else if (u.role === "store") {
        const { data: s, error: sError } = await supabase
          .from("stores")
          .select("id, name, area, description")
          .eq("owner_user_id", userId)
          .maybeSingle();

        if (!cancelled && !sError && s) {
          const st = s as (DbStoreRow & { id: string });

          // ★ storeId を保持（console遷移などに使える）
          setStoreId(st.id);

          const areaValue: Area = knownAreas.includes((st.area ?? "") as Area)
            ? ((st.area as Area) ?? "")
            : "";

          baseProfile = {
            ...baseProfile,
            displayName: st.name ?? baseProfile.displayName,
            area: areaValue,
            intro:
              st.description && st.description.trim().length > 0
                ? st.description
                : baseProfile.intro,
          };
        }
      }

      if (cancelled) return;

      setProfile((prev) => ({
        ...prev,
        ...baseProfile,
      }));
    } catch (e) {
      console.error("Supabase profile unexpected error:", e);
    } finally {
      if (!cancelled) setLoading(false);
    }
  };

  fetchProfile();

  return () => {
    cancelled = true;
  };
}, [userId]);

  // ▼ 自分と userId の relations を復元（uuid 同士かつ別人のときだけ）
  useEffect(() => {
    if (!isUuid(currentUserId) || !isUuid(userId)) return;
    if (currentUserId === userId) return;

    let cancelled = false;

    (async () => {
      const row = await getRelation(currentUserId as UserId, userId as UserId);
      if (cancelled) return;
      setRelations(toRelationFlags(row));
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, userId]);

  // ▼ relations 操作用ハンドラ
  const handleToggleFollow = async () => {
    if (!isUuid(currentUserId) || !isUuid(userId)) return;
    if (currentUserId === userId) return;

    const nextEnabled = !relations.following;
    const ok = await setRelationOnServer({
      userId: currentUserId as UserId,
      targetId: userId as UserId,
      type: nextEnabled ? "follow" : null,
    });
    if (!ok) return;

    setRelations({
      following: nextEnabled,
      muted: false,
      blocked: false,
    });
  };

  const handleToggleMute = async () => {
    if (!isUuid(currentUserId) || !isUuid(userId)) return;
    if (currentUserId === userId) return;

    const nextEnabled = !relations.muted;
    const ok = await setRelationOnServer({
      userId: currentUserId as UserId,
      targetId: userId as UserId,
      type: nextEnabled ? "mute" : null,
    });
    if (!ok) return;

    setRelations({
      following: false,
      muted: nextEnabled,
      blocked: false,
    });
  };

  const handleToggleBlock = async () => {
    if (!isUuid(currentUserId) || !isUuid(userId)) return;
    if (currentUserId === userId) return;

    const nextEnabled = !relations.blocked;

    if (nextEnabled) {
      const ok = window.confirm(
        "このアカウントをブロックしますか？\nタイムラインやDMからも非表示になります。"
      );
      if (!ok) return;
    }

    const ok = await setRelationOnServer({
      userId: currentUserId as UserId,
      targetId: userId as UserId,
      type: nextEnabled ? "block" : null,
    });
    if (!ok) return;

    setRelations({
      following: false,
      muted: false,
      blocked: nextEnabled,
    });
  };

  // ▼ 旧 localStorage プロフィールで “上書き” する（過渡期の互換用）
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;

      const data = JSON.parse(raw) || {};
      setProfile((prev) => ({
        ...prev,
        handle: `@${userId}`,
        displayName: data.nickname || prev.displayName,
        area: (data.area as Area) || prev.area,
        intro:
          typeof data.intro === "string" && data.intro.trim().length > 0
            ? data.intro
            : prev.intro,
        messagePolicy:
          typeof data.messagePolicy === "string" &&
          data.messagePolicy.trim().length > 0
            ? data.messagePolicy
            : prev.messagePolicy,
        snsX: data.snsX ?? prev.snsX,
        snsLine: data.snsLine ?? prev.snsLine,
        snsOther: data.snsOther ?? prev.snsOther,
        avatarDataUrl:
          data.avatarDataUrl || data.avatarUrl || prev.avatarDataUrl,
        accountType: data.accountType
          ? data.accountType
          : typeof data.isMember === "boolean"
          ? data.isMember
            ? "会員"
            : "ゲスト"
          : prev.accountType,
      }));
    } catch (e) {
      console.warn("Failed to load loomroom profile from localStorage", e);
    }
  }, [userId, storageKey]);

  // ▼ 自分の投稿一覧を Supabase から取得
  useEffect(() => {
    let cancelled = false;

    const fetchPosts = async () => {
      try {
        setLoadingPosts(true);
        setPostError(null);

        const { data, error } = await supabase
          .from("posts")
          .select("id, author_id, body, area, created_at")
          .eq("author_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);

        if (cancelled) return;

        if (error) {
          console.error("Supabase posts(fetch by author) error:", error);
          setPostError(
            (error as any)?.message ??
              "投稿の取得に失敗しました。時間をおいて再度お試しください。"
          );
          setPosts([]);
          return;
        }

        const rows = (data ?? []) as DbPostRow[];
        const mapped: UserPost[] = rows.map((row) => {
          const areaVal: Area | "" = knownAreas.includes(
            (row.area ?? "") as Area
          )
            ? ((row.area as Area) ?? "")
            : "";

          return {
            id: row.id,
            body: row.body ?? "",
            area: areaVal,
            timeAgo: timeAgo(row.created_at),
          };
        });

        setPosts(mapped);
      } catch (e: any) {
        if (cancelled) return;
        console.error("Supabase posts(unexpected) error:", e);
        setPostError(
          e?.message ??
            "投稿の取得中に不明なエラーが発生しました。時間をおいて再度お試しください。"
        );
        setPosts([]);
      } finally {
        if (!cancelled) {
          setLoadingPosts(false);
        }
      }
    };

    if (userId) {
      fetchPosts();
    }

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const avatarInitial =
    profile.displayName?.trim()?.charAt(0)?.toUpperCase() ?? "";

  const avatarStyle: React.CSSProperties = profile.avatarDataUrl
    ? {
        backgroundImage: `url(${profile.avatarDataUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {};

  return (
    <>
      <div className="app-shell">
        <AppHeader
          title={profile.displayName}
          subtitle={profile.handle}
          showBack={true}
        />

        <main className="app-main">
          <section className="therapist-hero">
            <div className="therapist-hero-row">
              <div className="avatar-circle" style={avatarStyle}>
                {!profile.avatarDataUrl && (
                  <span className="avatar-circle-text">
                    {avatarInitial || "U"}
                  </span>
                )}
              </div>

              <div className="therapist-hero-main">
                <div className="therapist-name-row">
                  <span className="therapist-name">
                    {profile.displayName}
                  </span>
                  <span className="therapist-handle">
                    {profile.handle}
                    {threadId && (
                      <Link
                        href={`/messages/${threadId}`}
                        className="dm-inline-btn no-link-style"
                      >
                        ✉
                      </Link>
                    )}

                    {currentUserId === userId && (
                      <>
                        {profile.role === "store" && storeId ? (
                          <Link
                            href={`/store/${storeId}/console`}
                            className="edit-inline-btn no-link-style"
                          >
                            ✎
                          </Link>
                        ) : profile.role === "therapist" && therapistId ? (
                          <Link
                            href={`/therapist/${therapistId}/console`}
                            className="edit-inline-btn no-link-style"
                          >
                            ✎
                          </Link>
                        ) : (
                          <Link
                            href={`/mypage/${userId}/console`}
                            className="edit-inline-btn no-link-style"
                          >
                            ✎
                          </Link>
                        )}
                      </>
                    )}
                  </span>
                </div>

                <div className="therapist-meta-row">
                  {profile.area && <span>{profile.area}</span>}
                  <span>アカウント種別：{profile.accountType}</span>
                </div>

                <div className="therapist-stats-row">
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

                {/* ▼ relations 操作（共通コンポーネント） */}
                {isUuid(currentUserId) &&
                  isUuid(userId) &&
                  currentUserId !== userId && (
                    <RelationActions
                      currentUserId={currentUserId}
                      targetId={userId}
                      onToggleMute={handleToggleMute}
                      onToggleBlock={handleToggleBlock}
                      onReport={() => {
                        alert(
                          "このアカウントの通報を受け付けました（現在はテスト用です）。"
                        );
                      }}
                    />
                  )}
              </div>
            </div>

            {profile.intro && (
              <p className="therapist-intro">{profile.intro}</p>
            )}

            {(profile.snsX || profile.snsLine || profile.snsOther) && (
              <div className="therapist-sns-block">
                <div className="therapist-sns-title">関連リンク</div>
                <div className="therapist-sns-list">
                  {profile.snsX && (
                    <a
                      href={profile.snsX}
                      target="_blank"
                      className="therapist-sns-chip"
                      rel="noreferrer"
                    >
                      X（旧Twitter）
                    </a>
                  )}
                  {profile.snsLine && (
                    <a
                      href={profile.snsLine}
                      target="_blank"
                      className="therapist-sns-chip"
                      rel="noreferrer"
                    >
                      LINE
                    </a>
                  )}
                  {profile.snsOther && (
                    <a
                      href={profile.snsOther}
                      target="_blank"
                      className="therapist-sns-chip"
                      rel="noreferrer"
                    >
                      その他のリンク
                    </a>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="therapist-posts-section">
            <h2 className="therapist-section-title">このページについて</h2>
            <div className="empty-hint">
              LoomRoomの中で、その人の雰囲気や、
              どんなペースで過ごしたいかをふんわり共有するためのページです。
            </div>
          </section>

          {/* ▼ 自分の投稿一覧 */}
          <section className="therapist-posts-section">
            <h2 className="therapist-section-title">投稿</h2>
            {loadingPosts && (
              <div className="empty-hint">投稿を読み込んでいます…</div>
            )}
            {postError && !loadingPosts && (
              <div className="empty-hint" style={{ color: "#b00020" }}>
                {postError}
              </div>
            )}
            {!loadingPosts && !postError && posts.length === 0 && (
              <div className="empty-hint">
                まだ投稿はありません。気が向いたタイミングで、短いことばから残してみてください。
              </div>
            )}
            {!loadingPosts && !postError && posts.length > 0 && (
              <div className="feed-list">
                {posts.map((p) => (
                  <article key={p.id} className="feed-item">
                    <div className="feed-item-inner">
                      <div
                        className="avatar-circle avatar-small"
                        style={avatarStyle}
                      >
                        {!profile.avatarDataUrl && (
                          <span className="avatar-circle-text">
                            {avatarInitial || "U"}
                          </span>
                        )}
                      </div>
                      <div className="feed-main">
                        <div className="feed-header">
                          <div className="feed-name-row">
                            <span className="post-name">
                              {profile.displayName}
                            </span>
                            <span className="post-username">
                              {profile.handle}
                            </span>
                          </div>
                          <div className="post-meta">
                            {p.area && (
                              <span className="post-area">{p.area}</span>
                            )}
                            <span className="post-dot">・</span>
                            <span className="post-time">{p.timeAgo}</span>
                          </div>
                        </div>
                        <div className="post-body">
                          {p.body.split("\n").map((line, idx) => (
                            <p key={idx}>
                              {line || (
                                <span style={{ opacity: 0.3 }}>　</span>
                              )}
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

        <BottomNav active="mypage" hasUnread={hasUnread} />
      </div>

      <style jsx>{`
        .therapist-hero {
          padding: 4px 0 12px;
          border-bottom: 1px solid var(--border);
          margin-bottom: 8px;
        }

        .therapist-hero-row {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-bottom: 8px;
        }

        .therapist-hero-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .therapist-name-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: baseline;
        }

        .therapist-name {
          font-size: 16px;
          font-weight: 600;
        }

        .therapist-handle {
          font-size: 12px;
          color: var(--text-sub);
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .therapist-meta-row {
          font-size: 11px;
          color: var(--text-sub);
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .therapist-stats-row {
          font-size: 11px;
          color: var(--text-sub);
          display: flex;
          gap: 10px;
        }

        .therapist-intro {
          font-size: 13px;
          line-height: 1.7;
          margin-top: 6px;
        }

        .therapist-sns-block {
          margin-top: 10px;
        }

        .therapist-sns-title {
          font-size: 12px;
          color: var(--text-sub);
          margin-bottom: 4px;
        }

        .therapist-sns-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .therapist-sns-chip {
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-main);
          text-decoration: none;
        }

        .therapist-posts-section {
          margin-top: 6px;
        }

        .therapist-section-title {
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

        .avatar-small {
          width: 32px;
          height: 32px;
        }

        .edit-inline-btn {
          margin-left: 6px;
          font-size: 14px;
          opacity: 0.8;
        }
        .edit-inline-btn:hover {
          opacity: 1;
        }
      `}</style>
    </>
  );
};

export default PublicMyPage;