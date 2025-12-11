// app/therapist/[id]/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import type { CSSProperties } from "react";
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

// 共通DB型を利用
import type {
  DbTherapistRow,
  DbUserRow,
  DbPostRow,
} from "@/types/db";

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

type TherapistProfile = {
  displayName: string;
  handle: string;
  area: Area | "";
  intro: string;
  messagePolicy: string;
  snsX?: string;
  snsLine?: string;
  snsOther?: string;
  avatarDataUrl?: string;
};

type TherapistPost = {
  id: string;
  body: string;
  area: Area | "";
  timeAgo: string;
};

// 未読バッジ（デモ）
const hasUnread = true;

// デモ用：セラピストの初期プロフィール（DB / localStorage が空のとき用）
const DEFAULT_PROFILES: Record<string, TherapistProfile> = {
  taki: {
    displayName: "TAKI",
    handle: "@taki_lux",
    area: "中部",
    intro:
      "「大丈夫かな」と力が入りすぎてしまう方が、少しずつ呼吸をゆるめられる時間をイメージしています。",
    messagePolicy:
      "返信はできるだけ当日中を心がけていますが、遅くなることもあります。ゆっくりお待ちいただけたら嬉しいです。",
    snsX: "https://x.com/taki_lux",
    snsLine: "",
    snsOther: "",
    avatarDataUrl: undefined,
  },
  default: {
    displayName: "セラピスト",
    handle: "@loomroom_therapist",
    area: "中部",
    intro:
      "落ち着いた会話と、静かに安心できる時間を大切にしています。はじめての方も、そのままの言葉で大丈夫です。",
    messagePolicy:
      "メッセージはなるべく早くお返事しますが、少しお時間をいただくこともあります。",
    snsX: "",
    snsLine: "",
    snsOther: "",
    avatarDataUrl: undefined,
  },
};

// ローカルストレージキー
const STORAGE_PREFIX = "loomroom_therapist_profile_";

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

const TherapistProfilePage: React.FC = () => {
  const params = useParams<{ id: string }>();
  const therapistId = (params?.id as string) || "taki"; // URLの [id]（therapists.id）
  const storageKey = `${STORAGE_PREFIX}${therapistId}`;

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // therapists.user_id（= users.id / uuid）を relations 用に保持
  const [therapistUserId, setTherapistUserId] = useState<string | null>(null);
  // 所属店舗ID（store_id）を保持（NULLならテスト参加中扱い）
  const [linkedStoreId, setLinkedStoreId] = useState<string | null>(null);

  // DM 用 threadId（いまは URL の [id] ベースのまま）
  const threadId =
    currentUserId && currentUserId !== therapistId
      ? makeThreadId(currentUserId, therapistId)
      : null;

  const [relations, setRelations] = useState<RelationFlags>({
    following: false,
    muted: false,
    blocked: false,
  });

  const [profile, setProfile] = useState<TherapistProfile>(() => {
    return DEFAULT_PROFILES[therapistId] || DEFAULT_PROFILES.default;
  });

  const [loadingProfile, setLoadingProfile] = useState<boolean>(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [posts, setPosts] = useState<TherapistPost[]>([]);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [loadingPosts, setLoadingPosts] = useState<boolean>(false);

  // 「店舗に紐づいているか」
  const isStoreLinked = !!linkedStoreId;

  // currentUserId をクライアント側で初期化
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = getCurrentUserId(); // ゲスト時は guest-xxxx など
    setCurrentUserId(id);
  }, []);

  // relation の復元
  useEffect(() => {
    if (!currentUserId) return;

    // 1) Supabase: uuid 会員同士なら relations テーブルから
    if (isUuid(currentUserId) && isUuid(therapistUserId)) {
      if (currentUserId === therapistUserId) return;

      let cancelled = false;

      (async () => {
        const row = await getRelation(
          currentUserId as UserId,
          therapistUserId as UserId
        );
        if (cancelled) return;
        setRelations(toRelationFlags(row));
      })();

      return () => {
        cancelled = true;
      };
    }

    // 2) それ以外（guest 等）は旧ローカルストレージ版で復元
    if (currentUserId !== therapistId) {
      const flags = getLocalRelationFlags(
        currentUserId as UserId,
        therapistId as UserId
      );
      setRelations(flags);
    }
  }, [currentUserId, therapistUserId, therapistId]);

  // ===== フォロー / ミュート / ブロック =====
  const handleToggleFollow = async () => {
    if (!currentUserId) return;

    const nextEnabled = !relations.following;

    // 1) Supabase 版
    if (isUuid(currentUserId) && isUuid(therapistUserId)) {
      if (currentUserId === therapistUserId) return;

      const ok = await setRelationOnServer({
        userId: currentUserId as UserId,
        targetId: therapistUserId as UserId,
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
    if (currentUserId !== therapistId) {
      const updated = setLocalRelation(
        currentUserId as UserId,
        therapistId as UserId,
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
    if (isUuid(currentUserId) && isUuid(therapistUserId)) {
      if (currentUserId === therapistUserId) return;

      const ok = await setRelationOnServer({
        userId: currentUserId as UserId,
        targetId: therapistUserId as UserId,
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
    if (currentUserId !== therapistId) {
      const updated = setLocalRelation(
        currentUserId as UserId,
        therapistId as UserId,
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
        "このセラピストをブロックしますか？\nタイムラインやDMからも非表示になります。"
      );
      if (!ok) return;
    }

    // 1) Supabase 版
    if (isUuid(currentUserId) && isUuid(therapistUserId)) {
      if (currentUserId === therapistUserId) return;

      const ok = await setRelationOnServer({
        userId: currentUserId as UserId,
        targetId: therapistUserId as UserId,
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
    if (currentUserId !== therapistId) {
      const updated = setLocalRelation(
        currentUserId as UserId,
        therapistId as UserId,
        "block",
        nextEnabled
      );
      setRelations(updated);
    }
  };

  // ▼ Supabase から therapists / users / posts を読んでプロフィール＋投稿を反映
  useEffect(() => {
    let cancelled = false;

    const fetchProfileAndPosts = async () => {
      try {
        setLoadingProfile(true);
        setProfileError(null);
        setLoadingPosts(true);
        setPostsError(null);

        // 1) therapists から 1件取得（id = therapistId）
        const { data: therapist, error: tError } = await supabase
          .from("therapists")
          .select(
            "id, user_id, store_id, display_name, area, profile, avatar_url, created_at"
          )
          .eq("id", therapistId)
          .maybeSingle<DbTherapistRow>();

        if (cancelled) return;

        if (tError) {
          console.error(
            "Supabase therapist fetch error:",
            tError,
            "message:",
            (tError as any)?.message,
            "code:",
            (tError as any)?.code
          );
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

        // relations 用に、therapists.user_id（= users.id / uuid）を保持
        setTherapistUserId(therapist.user_id);
        // 店舗との紐づけ状態を保持
        setLinkedStoreId(therapist.store_id);

        // 2) 対応する users を取得
        let user: DbUserRow | null = null;
        if (therapist.user_id) {
          const { data: userRow, error: uError } = await supabase
            .from("users")
            .select("id, name, role, avatar_url, created_at")
            .eq("id", therapist.user_id)
            .maybeSingle<DbUserRow>();

          if (!cancelled) {
            if (uError) {
              console.error("Supabase user fetch error:", uError);
            } else {
              user = userRow;
            }
          }
        }

        if (cancelled) return;

        // 3) プロフィールにマージ（Supabase 基準）
        setProfile((prev: TherapistProfile) => ({
          ...prev,
          displayName:
            therapist.display_name?.trim().length
              ? therapist.display_name
              : prev.displayName,
          handle:
            user?.name && user.name.trim().length
              ? `@${user.name.trim()}`
              : prev.handle,
          area: toArea(therapist.area) || prev.area,
          intro:
            therapist.profile && therapist.profile.trim().length
              ? therapist.profile
              : prev.intro,
          // users.avatar_url を優先し、なければ therapists.avatar_url を利用
          avatarDataUrl:
            user?.avatar_url ??
            (therapist as any).avatar_url ??
            prev.avatarDataUrl,
        }));
        setLoadingProfile(false);

        // 4) posts 取得（author_id = therapist.user_id）
        if (therapist.user_id) {
          const { data: postRows, error: pError } = await supabase
            .from("posts")
            .select("id, author_id, body, area, created_at")
            .eq("author_id", therapist.user_id)
            .order("created_at", { ascending: false })
            .limit(50);

          if (cancelled) return;

          if (pError) {
            console.error("Supabase therapist posts error:", pError);
            setPostsError(
              (pError as any)?.message ??
                "投稿の取得に失敗しました。時間をおいて再度お試しください。"
            );
            setPosts([]);
          } else {
            const rows = (postRows ?? []) as DbPostRow[];
            const mapped: TherapistPost[] = rows.map((row: DbPostRow) => {
              const areaVal: Area | "" = KNOWN_AREAS.includes(
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
          }
        } else {
          setPosts([]);
        }
      } catch (e: any) {
        if (cancelled) return;
        console.error("Supabase therapist unexpected error:", e);
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

    if (therapistId) {
      fetchProfileAndPosts();
    }

    return () => {
      cancelled = true;
    };
  }, [therapistId]);

  // ▼ コンソールからの localStorage で上書き（Supabase より後に定義 → ローカル優先）
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<TherapistProfile>;
      setProfile((prev: TherapistProfile) => ({
        ...prev,
        ...data,
      }));
    } catch (e) {
      console.warn("Failed to load therapist profile from localStorage", e);
    }
  }, [storageKey]);

  const avatarInitial =
    profile.displayName?.trim()?.charAt(0)?.toUpperCase() ?? "T";

  const avatarStyle: CSSProperties = profile.avatarDataUrl
    ? {
        backgroundImage: `url(${profile.avatarDataUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {};

  const canShowRelationUi =
    !!currentUserId &&
    currentUserId !== therapistId;

  // DMボタンは「店舗に紐づいていて」「自分ではなく」「ブロックしていない」場合のみ
  const canShowDmButton =
    !!threadId && isStoreLinked && !relations.blocked;

  return (
    <>
      <div className="app-shell">
        <AppHeader
          title={profile.displayName}
          subtitle={profile.handle}
          showBack={true}
        />

        <main className="app-main">
          <section className="profile-hero">
            <div className="profile-hero-row">
              <div className="avatar-circle" style={avatarStyle}>
                {!profile.avatarDataUrl && (
                  <span className="avatar-circle-text">{avatarInitial}</span>
                )}
              </div>

              <div className="profile-hero-main">
                <div className="profile-name-row">
                  <span className="profile-name">{profile.displayName}</span>
                  <span className="profile-handle">
                    {profile.handle}
                    {canShowDmButton && (
                      <Link
                        href={`/messages/${threadId}`}
                        className="dm-inline-btn no-link-style"
                      >
                        ✉
                      </Link>
                    )}

                    {currentUserId === therapistUserId && (
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

            {(profile.snsX || profile.snsLine || profile.snsOther) && (
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
          </section>

          {/* 投稿一覧（Supabaseのpostsベース） */}
          <section className="therapist-posts-section">
            <h2 className="profile-section-title">投稿</h2>

            {loadingPosts && (
              <div className="empty-hint">投稿を読み込んでいます…</div>
            )}
            {postsError && !loadingPosts && (
              <div className="empty-hint" style={{ color: "#b00020" }}>
                {postsError}
              </div>
            )}
            {!loadingPosts && !postsError && posts.length === 0 && (
              <div className="empty-hint">
                まだ投稿はありません。最初のひとことが並ぶまで、少しだけお待ちください。
              </div>
            )}
            {!loadingPosts && !postsError && posts.length > 0 && (
              <div className="feed-list">
                {posts.map((p: TherapistPost) => (
                  <article key={p.id} className="feed-item">
                    <div className="feed-item-inner">
                      <div className="avatar" style={avatarStyle}>
                        {!profile.avatarDataUrl && "🧑‍🦱"}
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
                            {p.area && <span>{p.area}</span>}
                            <span>・</span>
                            <span>{p.timeAgo}</span>
                          </div>
                        </div>
                        <div className="post-body">
                          {p.body.split("\n").map(
                            (line: string, idx: number) => (
                              <p key={idx}>
                                {line || (
                                  <span style={{ opacity: 0.3 }}>　</span>
                                )}
                              </p>
                            )
                          )}
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

export default TherapistProfilePage;