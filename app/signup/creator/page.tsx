// app/signup/creator/page.tsx
"use client";

import React from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";

const HAS_UNREAD = false;

export default function CreatorSignupPage() {
  return (
    <div className="app-shell">
      <AppHeader title="店舗・セラピスト登録" />

      <main className="app-main">
        <section className="page-section">
          <div className="section-label">
            <span className="section-chip">for stores &amp; therapists</span>
          </div>

          <h1 className="page-title">店舗・セラピストの登録案内</h1>
          <p className="page-description">
            LRoomを「お店の管理ツール」「セラピストの活動ベース」として
            使いたい方向けのご案内です。
            <br />
            いまはクローズドテストの段階のため、登録方法を少しずつ整えている途中です。
          </p>

          <div className="card-list">
            {/* 現在のステータス */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">現在のステータス</h2>
                <span className="status-pill status-pill--closed">
                  クローズド運用中
                </span>
              </div>
              <p className="card-text">
                いまは <strong>LuX nagoya 周辺の限られた店舗・セラピスト</strong> と、
                クローズドでテスト運用をしています。
                <br />
                公開登録フォームは、正式運用のタイミングで順番に開いていきます。
              </p>
              <div className="card-note-box">
                <p className="card-note">
                  すでに個別にお声がけしている店舗・セラピストの方は、
                  これまでどおりDMやチャットでご相談ください。
                </p>
              </div>
            </div>

            {/* 今後のロードマップ */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">今後追加していく内容</h2>
                <span className="status-pill status-pill--planning">
                  roadmap
                </span>
              </div>
              <ul className="bullet-list">
                <li>店舗アカウントの審査フロー</li>
                <li>セラピストアカウント発行フロー</li>
                <li>売上・予約管理コンソールとの連携</li>
                <li>LRoom内プロフィールとタイムラインの連携</li>
              </ul>
              <p className="card-note">
                これらは、一度にすべてではなく、
                安全性と使いやすさを確認しながら順番に公開していきます。
              </p>
            </div>

            {/* 参加を検討されている方向け */}
            <div className="card">
              <h2 className="card-title">参加を検討されている方へ</h2>
              <p className="card-text">
                すでにLuX界隈でつながりのある店舗・セラピストの方とは、
                先にテスト参加という形でご一緒していく予定です。
              </p>
              <ul className="bullet-list bullet-list--soft">
                <li>まずはLuX nagoyaのホームページをご覧いただく</li>
                <li>公式LINEやDMで「LRoomについて聞きたい」とお知らせいただく</li>
                <li>こちらからテスト参加の条件や流れをご案内</li>
              </ul>
              <p className="card-note">
                まだ「本登録フォーム」は公開していませんが、
                テスト段階から一緒に形にしていただける店舗・セラピストの方は、
                個別にご相談ください。
              </p>

              <div className="cta-block">
                <p className="cta-text">
                  開発中のテスト画面を少しだけ触ってみたい方は、
                  下のボタンから「登録方法を選ぶ」テスト画面に進めます。
                </p>
                <a href="/signup/creator/start" className="cta-button-link">
                  店舗・セラピスト登録のテスト画面を見る
                </a>
                <p className="cta-note">
                  ※ こちらは開発途中のテスト版であり、
                  実際のアカウント発行や審査にはまだ直結しません。
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <BottomNav active="mypage" hasUnread={HAS_UNREAD} />

      <style jsx>{`
        .app-shell {
          min-height: 100vh;
          max-width: 480px;
          margin: 0 auto;
          background: var(--bg);
          color: var(--text-main);
          display: flex;
          flex-direction: column;
        }

        .app-main {
          flex: 1;
          padding: 16px 16px 88px;
        }

        .page-section {
          padding-top: 4px;
        }

        .section-label {
          margin-bottom: 6px;
        }

        .section-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 10px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          background: #f4ede1;
          color: #a47a45;
        }

        .page-title {
          font-size: 18px;
          font-weight: 600;
          letter-spacing: 0.02em;
          margin-bottom: 4px;
        }

        .page-description {
          font-size: 12px;
          line-height: 1.7;
          color: var(--text-sub);
          margin-bottom: 16px;
        }

        .card-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .card {
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--surface);
          padding: 14px 14px 16px;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
        }

        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 6px;
        }

        .card-title {
          font-size: 14px;
          font-weight: 600;
        }

        .card-text {
          font-size: 12px;
          line-height: 1.7;
          color: var(--text-main);
          margin-bottom: 8px;
        }

        .card-note-box {
          margin-top: 4px;
          padding: 8px 10px;
          border-radius: 12px;
          background: #fffaf4;
        }

        .card-note {
          font-size: 11px;
          color: var(--text-sub);
          line-height: 1.7;
        }

        .status-pill {
          display: inline-flex;
          align-items: center;
          padding: 3px 8px;
          border-radius: 999px;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          border: 1px solid transparent;
        }

        .status-pill--closed {
          background: #fef4f2;
          color: #c2410c;
          border-color: #fed7c4;
        }

        .status-pill--planning {
          background: #f3f5ff;
          color: #4f46e5;
          border-color: #d4ddff;
        }

        .bullet-list {
          margin: 0 0 8px;
          padding-left: 18px;
          font-size: 12px;
          line-height: 1.7;
          color: var(--text-main);
        }

        .bullet-list li + li {
          margin-top: 2px;
        }

        .bullet-list--soft {
          color: var(--text-sub);
        }

        .cta-block {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px dashed var(--border);
        }

        .cta-text {
          font-size: 11px;
          color: var(--text-sub);
          line-height: 1.7;
          margin-bottom: 8px;
        }

        .cta-button-link {
          display: inline-flex;
          width: 100%;
          justify-content: center;
          align-items: center;
          border-radius: 999px;
          border: 1px solid var(--accent);
          padding: 9px 0;
          font-size: 13px;
          font-weight: 500;
          color: var(--accent-deep, #b4895a);
          background: #fffdf8;
          text-decoration: none;
        }

        .cta-note {
          margin-top: 6px;
          font-size: 10px;
          color: var(--text-sub);
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}