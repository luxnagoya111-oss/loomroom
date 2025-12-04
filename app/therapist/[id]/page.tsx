"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// ★ ここに置く（import の下 / コンポーネントの上）
const CURRENT_USER_ID = "guest";

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
  /** コンソールで設定したアイコン画像（data URL） */
  avatarDataUrl?: string;
};

type PostLike = {
  id: string;
  authorId: string;
  authorName: string;
  area: Area;
  body: string;
  timeAgo: string;
};

// 未読バッジ（デモ）
const hasUnread = true;

// デモ用：セラピストの初期プロフィール
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
  },
};

// デモ投稿（本番ではAPI or DBから取得）
const DEMO_POSTS: PostLike[] = [
  {
    id: "p1",
    authorId: "taki",
    authorName: "TAKI",
    area: "中部",
    body: "今日は「深呼吸する時間みたいだった」と言っていただけて、こちらもあたたかい気持ちになりました。",
    timeAgo: "2時間前",
  },
  {
    id: "p2",
    authorId: "taki",
    authorName: "TAKI",
    area: "中部",
    body: "緊張して当たり前なので、はじめましての方こそ、ゆっくりペースを合わせていきたいなと思っています。",
    timeAgo: "昨日",
  },
];

// ローカルストレージキー
const STORAGE_PREFIX = "loomroom_therapist_profile_";

const TherapistProfilePage: React.FC = () => {
  const params = useParams<{ id: string }>();
  const therapistId = (params?.id as string) || "taki";
  const storageKey = `${STORAGE_PREFIX}${therapistId}`;

  const [profile, setProfile] = useState<TherapistProfile>(() => {
    return DEFAULT_PROFILES[therapistId] || DEFAULT_PROFILES.default;
  });

  const [likes, setLikes] = useState<Record<string, boolean>>({});

  // プロフィールを localStorage から復元（avatarDataUrl 含めて上書き）
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<TherapistProfile>;
      setProfile((prev) => ({
        ...prev,
        ...data,
      }));
    } catch (e) {
      console.warn("Failed to load therapist profile", e);
    }
  }, [storageKey]);

  // アイコン用：頭文字とスタイル
  const avatarInitial =
    profile.displayName?.trim()?.charAt(0)?.toUpperCase() ?? "T";

  const avatarStyle: React.CSSProperties = profile.avatarDataUrl
    ? {
        backgroundImage: `url(${profile.avatarDataUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {};

  // このセラピストの投稿だけ抽出
  const posts = DEMO_POSTS.filter((p) => p.authorId === therapistId);

  const toggleLike = (postId: string) => {
    setLikes((prev) => ({
      ...prev,
      [postId]: !prev[postId],
    }));
  };

  return (
    <>
      <div className="app-shell">
        {/* ヘッダー */}
        <header className="app-header">
          <button
            type="button"
            className="header-icon-btn"
            onClick={() => history.back()}
          >
            ◀
          </button>
          <div className="app-header-center">
            <div className="app-title">{profile.displayName}</div>
            <div className="app-header-sub">{profile.handle}</div>
          </div>
          <div style={{ width: 30 }} />
        </header>

        {/* メイン */}
        <main className="app-main">
          {/* 上部プロフィールブロック */}
          <section className="therapist-hero">
            <div className="therapist-hero-row">
              {/* ★ アイコン画像 or イニシャル */}
              <div className="therapist-avatar" style={avatarStyle}>
                {!profile.avatarDataUrl && (
                  <span className="therapist-avatar-initial">
                    {avatarInitial}
                  </span>
                )}
              </div>

              <div className="therapist-hero-main">
                <div className="therapist-name-row">
                  <span className="therapist-name">{profile.displayName}</span>
                  <span className="therapist-handle">{profile.handle}</span>
                </div>
                <div className="therapist-meta-row">
                  {profile.area && <span>{profile.area}</span>}
                  <span>セラピスト</span>
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
              </div>
            </div>

            {profile.intro && (
              <p className="therapist-intro">{profile.intro}</p>
            )}

            {profile.messagePolicy && (
              <div className="therapist-policy-box">
                <div className="therapist-policy-title">
                  メッセージについて
                </div>
                <p className="therapist-policy-text">
                  {profile.messagePolicy}
                </p>
              </div>
            )}

            {(profile.snsX || profile.snsLine || profile.snsOther) && (
              <div className="therapist-sns-block">
                <div className="therapist-sns-title">関連リンク</div>
                <div className="therapist-sns-list">
                  {profile.snsX && (
                    <a
                      href={profile.snsX}
                      target="_blank"
                      rel="noreferrer"
                      className="therapist-sns-chip"
                    >
                      X（旧Twitter）
                    </a>
                  )}
                  {profile.snsLine && (
                    <a
                      href={profile.snsLine}
                      target="_blank"
                      rel="noreferrer"
                      className="therapist-sns-chip"
                    >
                      LINE
                    </a>
                  )}
                  {profile.snsOther && (
                    <a
                      href={profile.snsOther}
                      target="_blank"
                      rel="noreferrer"
                      className="therapist-sns-chip"
                    >
                      その他のリンク
                    </a>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* 投稿一覧（タイムライン風） */}
          <section className="therapist-posts-section">
            <h2 className="therapist-section-title">投稿</h2>

            {posts.length === 0 ? (
              <div className="empty-hint">
                まだ投稿はありません。最初のひとことが並ぶまで、少しだけお待ちください。
              </div>
            ) : (
              <div className="feed-list">
                {posts.map((p) => {
                  const liked = !!likes[p.id];
                  const likeCount = liked ? 1 : 0; // デモなので 0 or 1

                  return (
                    <div key={p.id} className="feed-item">
                      <div className="feed-item-inner">
                        {/* ★ 投稿側のアイコンも同じ画像を使用（未設定時は絵文字） */}
                        <div className="avatar" style={avatarStyle}>
                          {!profile.avatarDataUrl && "🧑‍🦱"}
                        </div>

                        <div className="feed-main">
                          <div className="feed-header">
                            <div className="feed-name-row">
                              <span className="post-name">
                                {p.authorName}
                              </span>
                              <span className="post-username">
                                {profile.handle}
                              </span>
                            </div>
                            <div className="post-meta">
                              {p.area && <span>{p.area}</span>}
                              <span>{p.timeAgo}</span>
                            </div>
                          </div>
                          <p className="post-body">{p.body}</p>
                          <div className="post-actions">
                            <button
                              type="button"
                              className={
                                "post-like-btn" +
                                (liked ? " post-like-btn--liked" : "")
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleLike(p.id);
                              }}
                            >
                              <span className="post-like-icon">
                                {liked ? "♥" : "♡"}
                              </span>
                              <span className="post-like-count">
                                {likeCount}
                              </span>
                            </button>
                            <span className="post-action-text">返信</span>
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

        {/* 下ナビ（ホームと同じ構成） */}
        <nav className="bottom-nav">
          <button
            type="button"
            className="nav-item"
            onClick={() => (window.location.href = "/")}
          >
            <span className="nav-icon">🏠</span>
            ホーム
          </button>
          <button
            type="button"
            className="nav-item"
            onClick={() => (window.location.href = "/search")}
          >
            <span className="nav-icon">🔍</span>
            さがす
          </button>
          <button
            type="button"
            className="nav-item"
            onClick={() => (window.location.href = "/compose")}
          >
            <span className="nav-icon">➕</span>
            投稿
          </button>
          <button
            type="button"
            className="nav-item"
            onClick={() => (window.location.href = "/messages")}
          >
            <span className="nav-icon">💌</span>
            メッセージ
          </button>
          <button
            type="button"
            className="nav-item"
            onClick={() => (window.location.href = "/notifications")}
          >
            <span className="nav-icon-wrap">
              <span className="nav-icon">🔔</span>
              {hasUnread && <span className="nav-badge-dot" />}
            </span>
            通知
          </button>
          <button
            type="button"
            className="nav-item"
            onClick={() =>
              (window.location.href = `/mypage/${CURRENT_USER_ID}/console`)
            }
          >
            <span className="nav-icon">👤</span>
            マイ
          </button>
        </nav>
      </div>

      {/* このページ専用スタイルだけ追加（クラス名かぶりなし） */}
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

        .therapist-avatar {
          width: 56px;
          height: 56px;
          border-radius: 999px;
          background: var(--surface-soft);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
          overflow: hidden;
        }

        .therapist-avatar-initial {
          font-size: 26px;
          font-weight: 600;
          color: #555;
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
        }

        .therapist-meta-row {
          font-size: 11px;
          color: var(--text-sub);
          display: flex;
          gap: 8px;
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

        .therapist-policy-box {
          margin-top: 10px;
          padding: 8px 10px;
          border-radius: 10px;
          background: var(--surface-soft);
        }

        .therapist-policy-title {
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .therapist-policy-text {
          font-size: 12px;
          line-height: 1.6;
          color: var(--text-sub);
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
      `}</style>
    </>
  );
};

export default TherapistProfilePage;