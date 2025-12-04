"use client";

import React from "react";

// ★ ここに置く（import の下 / コンポーネントの上）
const CURRENT_USER_ID = "guest"; 

type NavKey = "home" | "search" | "post" | "notifications" | "mypage";

// ★ まずは強制的に true（確認用）
const hasUnread = true;

const TherapistProfilePage: React.FC = () => {
  const [activeNav, setActiveNav] = React.useState<NavKey>("mypage");

  return (
    <>
      <div className="app-shell">
        {/* ヘッダー */}
        <header className="app-header">
          <button
            type="button"
            className="header-icon-btn"
            onClick={() => history.back()}
            aria-label="戻る"
          >
            ◀
          </button>

          <div className="app-header-center">
            <div className="app-title">プロフィール</div>
            <div className="app-header-sub">@taki_lux</div>
          </div>

          <button type="button" className="header-follow-btn">
            フォロー
          </button>
        </header>

        {/* メイン */}
        <main className="app-main">
          {/* プロフィール上部 */}
          <section className="profile-header">
            <div className="profile-avatar-wrap">
              <div className="profile-avatar">🦋</div>
            </div>

            <div className="profile-name-row">
              <div>
                <div className="profile-name">TAKI</div>
                <div className="profile-id">@taki_lux</div>
              </div>
              <div
                className="role-icon role-icon--therapist"
                title="セラピスト"
              />
            </div>

            <div className="profile-bio">
              ゆっくり息を整えて、大切にされる時間を思い出す場所。
              初めての方も、何度目かの方も、その日ごとのペースで大丈夫です。
            </div>

            <div className="profile-tags">
              <span className="tag">#ゆっくり過ごしたい</span>
              <span className="tag">#初めての女風</span>
              <span className="tag">#会話多め</span>
            </div>

            <div className="profile-meta-row">
              <span>名古屋 / 岐阜エリア</span>
              <span>LuX nagoya 所属</span>
            </div>
          </section>

          {/* 統計 */}
          <section className="profile-stats">
            <div className="stat-item">
              <div className="stat-value">128</div>
              <div className="stat-label">投稿</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">842</div>
              <div className="stat-label">フォロワー</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">1,9k</div>
              <div className="stat-label">いいね</div>
            </div>
          </section>

          {/* セクションタイトル */}
          <h2 className="section-title">最近の投稿</h2>

          {/* 最近の投稿（TLと同じカードデザイン） */}
          <article className="post-card">
            <div className="avatar">🦋</div>
            <div className="post-main">
              <div className="post-header">
                <div className="post-author-text">
                  <div className="post-name">TAKI</div>
                  <div className="post-username">@taki_lux</div>
                  <div className="post-meta">
                    <span>今日 19:40</span>
                  </div>
                </div>
                <div
                  className="role-icon role-icon--therapist"
                  title="セラピスト"
                />
              </div>

              <div className="post-body">
                今日は「久しぶりに自分のために時間を使いました」と話してくれた方がいて、
                その言葉がずっと残っています。あなたのペースで大丈夫なので、
                深呼吸するみたいに会いにきてもらえたら嬉しいです。
              </div>

              <div className="post-tags">
                <span className="tag">#自分のための時間</span>
              </div>

              <div className="post-actions">
                <span>♡ 52</span>
                <span>💬 6</span>
                <span>🔖 保存</span>
              </div>
            </div>
          </article>

          <article className="post-card">
            <div className="avatar">🦋</div>
            <div className="post-main">
              <div className="post-header">
                <div className="post-author-text">
                  <div className="post-name">TAKI</div>
                  <div className="post-username">@taki_lux</div>
                  <div className="post-meta">
                    <span>昨日</span>
                  </div>
                </div>
                <div
                  className="role-icon role-icon--therapist"
                  title="セラピスト"
                />
              </div>

              <div className="post-body">
                「今日は会話だけでもいいですか？」と聞かれることがあります。
                もちろん大丈夫です。触れ合いよりも、安心して話せる場所が
                必要な日もありますよね。
              </div>

              <div className="post-actions">
                <span>♡ 41</span>
                <span>💬 3</span>
              </div>
            </div>
          </article>
        </main>

        {/* 下ナビ（ここは globals.css のレイアウトを使用） */}
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

      {/* このページ専用の見た目だけローカルに持つ */}
      <style jsx>{`
        .app-main {
          padding: 12px 16px 120px;
        }

        .app-header-sub {
          font-size: 12px;
          color: var(--text-sub);
        }

        .header-follow-btn {
          padding: 5px 14px;
          border-radius: 999px;
          border: 1px solid var(--accent);
          background: var(--accent-soft);
          color: var(--accent);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }

        .profile-header {
          background: var(--surface);
          border-radius: 16px;
          border: 1px solid var(--border);
          padding: 16px;
          margin-bottom: 14px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.03);
        }
        .profile-avatar-wrap {
          display: flex;
          justify-content: center;
          margin-bottom: 12px;
        }
        .profile-avatar {
          width: 74px;
          height: 74px;
          border-radius: 999px;
          background: #ddd;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 36px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }
        .profile-name-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        .profile-name {
          font-size: 18px;
          font-weight: 600;
        }
        .profile-id {
          font-size: 13px;
          color: var(--text-sub);
        }
        .profile-bio {
          font-size: 14px;
          line-height: 1.7;
          margin-top: 2px;
        }
        .profile-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 10px;
        }
        .tag {
          font-size: 11px;
          color: var(--accent);
          background: var(--accent-soft);
          padding: 3px 8px;
          border-radius: 999px;
        }
        .profile-meta-row {
          display: flex;
          gap: 12px;
          margin-top: 10px;
          font-size: 12px;
          color: var(--text-sub);
          flex-wrap: wrap;
        }

        .profile-stats {
          display: flex;
          background: var(--surface);
          border-radius: 16px;
          border: 1px solid var(--border);
          margin-bottom: 12px;
          overflow: hidden;
        }
        .stat-item {
          flex: 1;
          padding: 10px 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          border-right: 1px solid var(--border);
        }
        .stat-item:last-child {
          border-right: none;
        }
        .stat-value {
          font-size: 16px;
          font-weight: 600;
        }
        .stat-label {
          font-size: 11px;
          color: var(--text-sub);
        }

        .section-title {
          margin: 10px 2px 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-sub);
        }

        .post-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 14px;
          display: flex;
          gap: 12px;
          margin-bottom: 12px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.04);
        }
        .avatar {
          width: 38px;
          height: 38px;
          border-radius: 999px;
          background: #ddd;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }
        .post-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .post-header {
          display: flex;
          justify-content: space-between;
        }
        .post-author-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .post-name {
          font-weight: 600;
        }
        .post-username {
          font-size: 12px;
          color: var(--text-sub);
        }
        .post-meta {
          font-size: 11px;
          color: var(--text-sub);
          display: flex;
          gap: 6px;
        }
        .post-body {
          font-size: 14px;
          line-height: 1.6;
        }
        .post-tags {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .post-actions {
          margin-top: 6px;
          display: flex;
          gap: 16px;
          font-size: 13px;
          color: var(--text-sub);
        }

        .role-icon {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          border: 1px solid var(--accent);
          background: var(--accent-soft);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          color: var(--accent);
        }
        .role-icon--therapist::before {
          content: "✦";
        }
      `}</style>
    </>
  );
};

export default TherapistProfilePage;