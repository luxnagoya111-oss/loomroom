// app/mypage/[id]/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// ★ ここに置く（import の下 / コンポーネントの上）
const CURRENT_USER_ID = "guest";

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

const STORAGE_KEY = "loomroom_profile_v1";
const hasUnread = true;

const PublicMyPage: React.FC = () => {
  const params = useParams();
  const userId = (params?.id as string) || "user";

  const [nickname, setNickname] = useState<string>("あなた");
  const [area, setArea] = useState<Area>("");
  const [intro, setIntro] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as {
        nickname?: string;
        area?: Area;
        intro?: string;
      };
      if (data.nickname) setNickname(data.nickname);
      if (data.area) setArea(data.area);
      if (typeof data.intro === "string") setIntro(data.intro);
    } catch (e) {
      console.warn("Failed to load LoomRoom public profile", e);
    }
  }, []);

  // ★ ニックネームの頭文字を丸アイコンに表示
  const avatarInitial =
    nickname && nickname.trim().length > 0
      ? nickname.trim().charAt(0).toUpperCase()
      : "U";

  return (
    <div className="app-shell">
      {/* ヘッダー */}
      <header className="app-header">
        <div className="app-header-left">
          <div className="logo-circle" />
          <div className="app-title">プロフィール</div>
        </div>
        <button
          type="button"
          className="header-icon-btn"
          onClick={() => history.back()}
        >
          ◀
        </button>
      </header>

      {/* メイン：表示専用プロフィール */}
      <main className="app-main">
        <section className="mypage-card profile-card">
          <div className="profile-top-row">
            <div className="profile-avatar">{avatarInitial}</div>
            <div className="profile-main-text">
              <div className="profile-nickname-display">
                {nickname || "（ニックネーム未設定）"}
              </div>
              <div className="profile-id-hint">@{userId}</div>
            </div>
          </div>

          <div className="profile-sub-row">
            <div className="profile-sub-pill">アカウント種別：ゲスト</div>
            {area && (
              <div className="profile-sub-pill profile-sub-pill--soft">
                よく使うエリア：{area}
              </div>
            )}
          </div>
        </section>

        <section className="mypage-card">
          <h2 className="mypage-section-title">ひとこと</h2>
          <p className="public-intro-text">
            {intro
              ? intro
              : "まだ自己紹介は書かれていません。ゆっくり整えていく予定のページです。"}
          </p>
        </section>

        <section className="mypage-card">
          <h2 className="mypage-section-title">このページについて</h2>
          <p className="public-intro-text">
            LoomRoomの中で、その人の雰囲気や、どんなペースで過ごしたいかを
            ふんわり共有するためのページです。
          </p>
        </section>
      </main>

      {/* 下ナビ：マイをアクティブ */}
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
          className="nav-item is-active"
          onClick={() =>
            (window.location.href = `/mypage/${CURRENT_USER_ID}/console`)
          }
        >
          <span className="nav-icon">👤</span>
          マイ
        </button>
      </nav>

      <style jsx>{`
        .mypage-card {
          background: var(--surface);
          border-radius: 16px;
          border: 1px solid var(--border);
          padding: 14px 14px 12px;
          margin-bottom: 12px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.03);
        }

        .profile-card {
          padding-top: 16px;
        }

        .profile-top-row {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .profile-avatar {
          width: 52px;
          height: 52px;
          border-radius: 999px;
          background: #ddd;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          font-weight: 600;
          color: #555;
        }

        .profile-main-text {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .profile-nickname-display {
          font-size: 16px;
          font-weight: 600;
        }

        .profile-id-hint {
          font-size: 11px;
          color: var(--text-sub);
        }

        .profile-sub-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 10px;
        }

        .profile-sub-pill {
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 999px;
          background: var(--accent-soft);
          color: var(--accent);
        }

        .profile-sub-pill--soft {
          background: var(--surface-soft);
          color: var(--text-sub);
        }

        .mypage-section-title {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 8px;
          color: var(--text-sub);
        }

        .public-intro-text {
          font-size: 13px;
          line-height: 1.7;
          color: var(--text-main);
        }
      `}</style>
    </div>
  );
};

export default PublicMyPage;