"use client";

import React from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { getCurrentUserId } from "@/lib/auth";

const HAS_UNREAD = false;

/**
 * /signup
 *
 * LRoom をどんな立場で使うかを選ぶ入口ページ。
 * - 一般ユーザー: /signup/user へ
 * - セラピスト / 店舗: /signup/creator/start へ
 */
export default function SignupPage() {
  // フェーズ0で決めた「正しい現在ユーザーID取得」
  // （現状このページでは利用しないが、将来的にログ集計などで使えるよう保持）
  const currentUserId = getCurrentUserId();

  return (
    <div className="app-shell">
      <AppHeader title="会員登録" />
      <main className="app-main">
        <div className="signup-root">
          <p className="signup-lead">
            LRoom をどんな立場で使うかを選んでください。
          </p>

          <section className="signup-section">
            <h2 className="section-title">一般ユーザーとして使う</h2>
            <p className="section-text">
              セラピストや店舗の投稿を見たり、DMで相談したりするための登録です。
              まずは簡単な希望内容を教えてください。
            </p>
            <Link href="/signup/user" className="primary-btn">
              一般ユーザーとして登録申請する
            </Link>
          </section>

          <section className="signup-section">
            <h2 className="section-title">セラピスト / 店舗として使う</h2>
            <p className="section-text">
              LRoom に掲載したいセラピスト / 店舗向けの申し込みです。
              審査後に、プロフィール編集やDM機能が使えるアカウントを発行します。
            </p>
            <Link href="/signup/creator/start" className="secondary-btn">
              セラピスト / 店舗として申し込む
            </Link>
          </section>

          <p className="signup-note">
            ※ 18歳未満の方はご利用いただけません。
          </p>
        </div>
      </main>

      <BottomNav hasUnread={HAS_UNREAD} />

      <style jsx>{`
        .app-shell {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: #faf7f3;
        }

        .app-main {
          flex: 1;
          padding: 12px 12px 72px;
        }

        .signup-root {
          max-width: 480px;
          margin: 0 auto;
        }

        .signup-lead {
          font-size: 13px;
          color: var(--text-sub, #666);
          line-height: 1.7;
          margin-bottom: 16px;
        }

        .signup-section {
          background: #ffffff;
          border-radius: 16px;
          padding: 16px 14px 14px;
          box-shadow: 0 8px 24px rgba(10, 10, 10, 0.02);
          border: 1px solid rgba(220, 210, 200, 0.7);
          margin-bottom: 16px;
        }

        .section-title {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .section-text {
          font-size: 12px;
          color: var(--text-sub, #666);
          line-height: 1.7;
          margin-bottom: 12px;
        }

        .primary-btn,
        .secondary-btn {
          display: flex;
          justify-content: center;
          align-items: center;
          border-radius: 999px;
          padding: 9px 0;
          font-size: 13px;
          font-weight: 500;
          text-decoration: none;
        }

        .primary-btn {
          border: none;
          background: linear-gradient(
            135deg,
            var(--accent, #d9b07c),
            var(--accent-deep, #b4895a)
          );
          color: #fff;
        }

        .secondary-btn {
          border: 1px solid var(--accent, #d9b07c);
          color: var(--accent-deep, #b4895a);
          background: #fffdf8;
        }

        .signup-note {
          font-size: 11px;
          color: var(--text-sub, #777);
          margin-top: 8px;
        }
      `}</style>
    </div>
  );
}