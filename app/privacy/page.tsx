"use client";

import React from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";

const hasUnread = false;

export default function PrivacyPage() {
  return (
    <div className="policy-shell">
      <AppHeader title="プライバシーポリシー" />

      <main className="policy-main">
        <section className="policy-section">
          <h1 className="policy-title">プライバシーポリシー</h1>

          <p className="policy-description">
            LRoom（以下「本サービス」）は、利用者のプライバシーを尊重し、個人情報等の適切な取扱いに努めます。
            本ポリシーは、本サービスの提供にあたり当社（運営者）が取得・利用する情報の内容と目的、管理方法等を定めるものです。
          </p>

          {/* 事業者情報 */}
          <div className="policy-card">
            <h2 className="policy-heading">0. 事業者情報・お問い合わせ</h2>
            <p className="policy-text">
              本ポリシーに関するお問い合わせは、本サービス内の「お問い合わせ」からご連絡ください。
              <br />
              ※運営者情報の表示が必要な場合は、別途「特定商取引法に基づく表記」等のページで開示します。
            </p>
          </div>

          {/* 取得する情報 */}
          <div className="policy-card">
            <h2 className="policy-heading">1. 取得する情報</h2>
            <p className="policy-text">
              本サービスは、利用状況に応じて次の情報を取得する場合があります。
            </p>

            <h3 className="policy-subheading">1-1. アカウント情報</h3>
            <ul className="policy-list">
              <li>表示名（ニックネーム）、プロフィール情報、アイコン画像（アップロードした場合）</li>
              <li>ログインに用いる認証情報（例：メールアドレス、認証プロバイダ情報）</li>
              <li>ユーザー識別子（UUID 等）、ロール（一般/店舗/セラピスト等）</li>
            </ul>

            <h3 className="policy-subheading">1-2. 投稿・リアクション・DM等のコンテンツ</h3>
            <ul className="policy-list">
              <li>投稿内容、投稿日時、公開範囲に関する設定（実装されている場合）</li>
              <li>いいね等のリアクション、フォロー/ミュート/ブロック等の関係データ</li>
              <li>DMのメッセージ内容、送受信日時、スレッド情報</li>
            </ul>

            <h3 className="policy-subheading">1-3. 利用環境・ログ情報</h3>
            <ul className="policy-list">
              <li>アクセスログ（IPアドレス、ブラウザ情報、参照元、閲覧日時等）</li>
              <li>端末情報（OS種別、画面サイズ等）、Cookie/ローカルストレージ情報</li>
              <li>不正防止のための識別子（セキュリティ目的で用いる場合）</li>
            </ul>

            <p className="policy-note">
              ※本サービスは、DM内容を「常時監視」する運用は行いません。ただし、通報対応・不正防止・障害対応等に必要な範囲で、
              運営がアクセス・確認する場合があります。
            </p>
          </div>

          {/* 利用目的 */}
          <div className="policy-card">
            <h2 className="policy-heading">2. 利用目的</h2>
            <p className="policy-text">取得した情報は、主に以下の目的で利用します。</p>
            <ul className="policy-list">
              <li>本サービスの提供（アカウント管理、投稿/DM機能の提供、本人確認を含む）</li>
              <li>安全確保（不正利用の検知、スパム対策、通報対応、利用制限の実施）</li>
              <li>品質改善（機能改善、障害解析、利用状況の統計的分析）</li>
              <li>問い合わせ対応（本人確認、履歴確認、連絡等）</li>
              <li>規約・ポリシー違反への対応（調査、措置、再発防止）</li>
            </ul>
          </div>

          {/* 第三者提供 / 委託 */}
          <div className="policy-card">
            <h2 className="policy-heading">3. 第三者提供・外部委託</h2>
            <h3 className="policy-subheading">3-1. 第三者提供</h3>
            <p className="policy-text">
              運営は、法令に基づく場合を除き、個人を特定できる情報を第三者へ提供しません。
            </p>

            <h3 className="policy-subheading">3-2. 外部サービスへの委託</h3>
            <p className="policy-text">
              本サービスは、機能提供・運用のために外部サービス（例：ホスティング、データベース、ストレージ、認証、分析等）を利用する場合があります。
              その際、委託先に対して必要最小限の情報を取り扱わせることがあります。
            </p>

            <p className="policy-note">
              ※現状の実装では Supabase 等の基盤サービスを利用しているため、データが国外リージョンで処理・保存される可能性があります。
            </p>
          </div>

          {/* 保存期間 */}
          <div className="policy-card">
            <h2 className="policy-heading">4. 保存期間</h2>
            <p className="policy-text">
              情報は、利用目的の達成に必要な期間保存し、不要となった場合は合理的な方法で削除または匿名化します。
              ただし、法令遵守・不正防止・紛争対応等のため一定期間保存する場合があります。
            </p>
          </div>

          {/* 安全管理 */}
          <div className="policy-card">
            <h2 className="policy-heading">5. 安全管理措置</h2>
            <p className="policy-text">
              運営は、情報の漏えい・滅失・毀損・不正アクセス等を防止するため、アクセス制御、権限管理、暗号化等の適切な措置を講じます。
              ただし、完全な安全を保証するものではありません。
            </p>
          </div>

          {/* 未成年 */}
          <div className="policy-card">
            <h2 className="policy-heading">6. 未成年の利用について</h2>
            <p className="policy-text">
              本サービスは18歳未満の方は利用できません。年齢確認のため、初回表示時に確認画面（AgeGate）を表示する場合があります。
            </p>
            <p className="policy-note">
              ※年齢確認の結果は、ローカルストレージ等に保存される場合があります（端末・ブラウザ単位）。
            </p>
          </div>

          {/* 開示・削除 */}
          <div className="policy-card">
            <h2 className="policy-heading">7. 利用者の権利（開示・訂正・削除等）</h2>
            <p className="policy-text">
              利用者は、本サービス内で編集可能なプロフィール情報等について、自己の情報を更新できます。
              それ以外の情報の開示・訂正・削除等のご希望がある場合は、お問い合わせよりご連絡ください。
              なお、法令上対応が必要な場合または合理的に対応可能な範囲で対応します。
            </p>
          </div>

          {/* 改定 */}
          <div className="policy-card">
            <h2 className="policy-heading">8. 改定</h2>
            <p className="policy-text">
              運営は、本ポリシーの内容を必要に応じて改定することがあります。重要な変更がある場合は、本サービス上での掲示その他合理的な方法で通知します。
            </p>
            <p className="policy-footer-note">制定日：2025年12月19日（ベータ版）</p>
          </div>
        </section>
      </main>

      <BottomNav active="mypage" hasUnread={hasUnread} />

      <style jsx>{`
        .policy-shell {
          width: 100%;
          max-width: 430px;
          margin: 0 auto;
        }

        .policy-main {
          padding: 12px 16px 120px;
        }

        .policy-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .policy-title {
          font-size: 16px;
          font-weight: 700;
          margin: 8px 0 0;
        }

        .policy-description {
          font-size: 12px;
          color: var(--text-sub);
          line-height: 1.8;
          margin: 0;
        }

        .policy-card {
          padding: 12px;
          border-radius: 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
        }

        .policy-heading {
          font-size: 13px;
          font-weight: 700;
          margin: 0 0 8px;
        }

        .policy-subheading {
          font-size: 12px;
          font-weight: 700;
          margin: 12px 0 6px;
          color: var(--text-main);
        }

        .policy-text {
          font-size: 12px;
          line-height: 1.8;
          color: var(--text-main);
          margin: 0 0 8px;
        }

        .policy-list {
          margin: 0 0 8px;
          padding-left: 18px;
          font-size: 12px;
          line-height: 1.8;
          color: var(--text-main);
        }

        .policy-note {
          margin: 8px 0 0;
          font-size: 11px;
          line-height: 1.8;
          color: var(--text-sub);
        }

        .policy-footer-note {
          margin: 10px 0 0;
          font-size: 11px;
          color: var(--text-sub);
          text-align: right;
        }
      `}</style>
    </div>
  );
}