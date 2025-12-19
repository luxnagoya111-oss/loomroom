"use client";

import React from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";

const hasUnread = false;

export default function GuidelinePage() {
  return (
    <div className="policy-shell">
      <AppHeader title="ガイドライン" />

      <main className="policy-main">
        <section className="policy-section">
          <h1 className="policy-title">コミュニティガイドライン</h1>

          <p className="policy-description">
            LRoom は、安心して情報発信ができる場を目指しています。
            このガイドラインは、投稿・プロフィール・DM など本サービス内のすべてのやり取りに適用されます。
            利用規約とあわせてご確認ください。
          </p>

          {/* 0 */}
          <div className="policy-card">
            <h2 className="policy-heading">0. 適用範囲</h2>
            <p className="policy-text">
              本ガイドラインは、本サービス内の投稿・プロフィール・コメント（実装されている場合）・DM・
              外部リンクの掲載・プロフィール記載内容等に適用されます。
              また、サービス外（外部SNS/通話等）へ誘導する行為も、被害防止の観点から対象となる場合があります。
            </p>
          </div>

          {/* 1 */}
          <div className="policy-card">
            <h2 className="policy-heading">1. 年齢制限（18歳未満の禁止）</h2>
            <p className="policy-text">
              本サービスは18歳以上の方のみ利用できます。18歳未満の登録・閲覧・投稿・DM 等はできません。
              年齢に関する虚偽が確認された場合、即時の利用停止等の措置を行うことがあります。
            </p>
          </div>

          {/* 2 */}
          <div className="policy-card">
            <h2 className="policy-heading">2. 禁止行為（共通）</h2>
            <p className="policy-text">
              以下に該当する行為は、投稿・プロフィール・DM を問わず禁止です。
            </p>
            <ul className="policy-list">
              <li>法令違反、または違反を助長する行為（詐欺、脅迫、恐喝、強要、売買春の勧誘等を含む）</li>
              <li>未成年に関する性的表現、搾取、出会いの募集、誘導</li>
              <li>同意のない性的な要求、露骨な性的表現の強要、執拗な誘い・連絡</li>
              <li>誹謗中傷、攻撃的言動、差別・ヘイト、暴力的表現、嫌がらせ</li>
              <li>個人情報の晒し（住所、電話、勤務先、顔写真、特定可能なSNS等の無断掲載）</li>
              <li>なりすまし（本人・店舗・運営を装う）、虚偽の身分表示</li>
              <li>スパム、過度な連投、同一文面の大量投稿、機械的な勧誘</li>
              <li>外部サービスへの不適切な誘導（詐欺的誘導、規約違反を伴う宣伝、無差別な営業等）</li>
              <li>通報の悪用（虚偽通報、報復目的の通報、嫌がらせ目的の通報）</li>
            </ul>

            <p className="policy-note">
              ※「違法かどうか判断が難しい」場合でも、利用者の安全を損なうおそれがあると運営が判断した場合、
              措置の対象となることがあります。
            </p>
          </div>

          {/* 3 */}
          <div className="policy-card">
            <h2 className="policy-heading">3. 投稿・プロフィールのルール</h2>
            <ul className="policy-list">
              <li>他者の権利を侵害しない（著作権・肖像権・プライバシー等）</li>
              <li>本人や第三者を特定できる情報を安易に載せない</li>
              <li>過度に露骨な表現や、相手に不快感を与えやすい内容は控える</li>
              <li>店舗・個人への評価投稿は、事実に基づき、攻撃的にならない書き方を推奨</li>
              <li>宣伝・誘導目的の投稿は、運営が制限する場合があります</li>
            </ul>
          </div>

          {/* 4 */}
          <div className="policy-card">
            <h2 className="policy-heading">4. DM（メッセージ）のルール</h2>
            <p className="policy-text">
              本サービスのDMは、主に一般ユーザーとセラピスト/店舗のコミュニケーションを想定しています
              （一般ユーザー同士のDMは原則不可という設計を含みます）。
            </p>

            <ul className="policy-list">
              <li>相手の同意を尊重する（返答を迫る、連投する、断られても続ける行為は禁止）</li>
              <li>性的な要求の押しつけ、脅し、条件提示による強要は禁止</li>
              <li>個人情報（フルネーム・住所・電話番号等）は必要最小限にし、慎重に扱う</li>
              <li>外部連絡先への誘導は、相手の意思を確認し、強制しない</li>
              <li>金銭・ギフト・投げ銭等の要求や取引の強要は禁止</li>
            </ul>

            <p className="policy-note">
              不快・危険を感じた場合は、ミュート/ブロックを優先し、必要に応じて通報してください。
            </p>
          </div>

          {/* 5 */}
          <div className="policy-card">
            <h2 className="policy-heading">5. 通報・ブロックについて</h2>
            <p className="policy-text">
              ガイドラインや規約に反していると思われる投稿・プロフィール・DM は、通報機能から運営に知らせることができます。
              通報の内容は確認のうえ、必要に応じて非表示、制限、停止等の対応を行います。
            </p>

            <p className="policy-note">
              ※ベータ運用中は、対応に時間がかかる場合があります。
              ただし、緊急性が高い（未成年・脅迫・詐欺等）と判断される場合は優先的に対応します。
            </p>
          </div>

          {/* 6 */}
          <div className="policy-card">
            <h2 className="policy-heading">6. 違反時の対応（エンフォースメント）</h2>
            <p className="policy-text">
              違反が確認された場合、運営は内容・悪質性・影響範囲等を踏まえて以下の措置を行うことがあります。
              重大な危険がある場合は、事前通知なく即時の措置を行う場合があります。
            </p>
            <ul className="policy-list">
              <li>投稿/プロフィール/DMの削除または非表示</li>
              <li>機能制限（投稿/DM/検索/表示の一部停止等）</li>
              <li>一時停止、または恒久的な利用停止</li>
              <li>必要に応じた関係機関への相談（法令に基づく対応）</li>
            </ul>
          </div>

          {/* 7 */}
          <div className="policy-card">
            <h2 className="policy-heading">7. ガイドラインの変更</h2>
            <p className="policy-text">
              サービスの運営状況や関連法令、外部サービスの規約変更等に応じて、本ガイドラインを改定することがあります。
              重要な変更がある場合は、本サービス上で告知します。
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