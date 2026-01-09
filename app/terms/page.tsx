"use client";

import React from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";

const hasUnread = false;

/**
 * ★問い合わせ先（あとで差し替え）
 * 例："/contact" もしくは "https://forms.gle/...."
 */
const CONTACT_URL = "/contact";

/**
 * ★推奨環境（必要なら編集）
 * “絶対保証しない” 形で書くのが安全
 */
const RECOMMENDED_ENV = [
  "スマートフォン：iOS Safari / Android Chrome（最新版推奨）",
  "PC：Chrome / Edge / Safari（最新版推奨）",
  "JavaScript・Cookie を有効にしてご利用ください",
];

export default function TermsPage() {
  return (
    <div className="policy-shell">
      <AppHeader title="利用規約" />

      <main className="policy-main">
        <section className="policy-section">
          <h1 className="policy-title">LRoom 利用規約</h1>

          <p className="policy-description">
            この利用規約（以下「本規約」）は、LRoom（以下「本サービス」）の利用条件を定めるものです。
            利用者は、本サービスを利用することにより、本規約に同意したものとみなされます。
            本サービスはベータ運用中であり、機能・表示・運用は予告なく変更される場合があります。
          </p>

          <div className="policy-card">
            <h2 className="policy-heading">第1条（定義）</h2>
            <p className="policy-text">
              本規約において使用する用語は、以下の意味を有します。
            </p>
            <ul className="policy-list">
              <li>「運営」：本サービスを企画・提供・管理する者（個人または法人）をいいます。</li>
              <li>「利用者」：本サービスを閲覧または利用するすべての者をいいます。</li>
              <li>「会員」：アカウント登録を行い、ログインして利用する者をいいます。</li>
              <li>
                「一般ユーザー」：主に閲覧・検索・投稿・DM（仕様の範囲内）等を利用する会員をいいます。
              </li>
              <li>
                「セラピスト」「店舗」：運営が定める手続により区分される会員をいいます（申請・承認・在籍紐づけ等を含む）。
              </li>
              <li>
                「コンテンツ」：投稿、プロフィール、画像、テキスト、DM、リンク等、本サービス上で表示される情報をいいます。
              </li>
            </ul>

            <h2 className="policy-heading">第2条（本規約の適用・優先関係）</h2>
            <p className="policy-text">
              1. 本規約は、利用者と運営との間の本サービス利用に関する一切の関係に適用されます。<br />
              2. 運営が本サービス上で別途定めるガイドライン、ポリシー、各種ルール（以下「個別規定」）は、本規約の一部を構成します。<br />
              3. 本規約と個別規定の内容が矛盾する場合、特段の定めがない限り、個別規定が優先します。
            </p>

            <h2 className="policy-heading">第3条（利用条件・年齢制限）</h2>
            <p className="policy-text">
              1. 本サービスは18歳以上の方のみ利用できます。18歳未満の登録・閲覧・投稿・DM等は一切できません。<br />
              2. 年齢、本人性、その他登録情報について虚偽が判明した場合、運営は事前通知なく利用停止等の措置を行うことがあります。<br />
              3. 運営は安全確保のため、必要に応じて年齢確認・本人確認に相当する情報の提示を求める場合があります（提示がない場合、機能制限等を行うことがあります）。
            </p>

            <h2 className="policy-heading">第4条（アカウント登録・管理）</h2>
            <p className="policy-text">
              1. 会員登録は、運営が定める方法により行うものとします。<br />
              2. 会員は、登録情報を最新・正確に保つよう努めるものとします。<br />
              3. 会員は、ログイン情報（パスワード等）を自己の責任で管理し、第三者に共有・貸与・譲渡してはなりません。<br />
              4. ログイン情報の管理不備、盗用、第三者使用等により会員または第三者に損害が生じた場合、運営は責任を負いません。ただし運営に故意または重過失がある場合はこの限りではありません。
            </p>

            <h2 className="policy-heading">第5条（アカウント種別・申請・審査）</h2>
            <p className="policy-text">
              1. 本サービスには一般ユーザー／セラピスト／店舗等の区分があり、機能や表示範囲が異なる場合があります。<br />
              2. セラピスト・店舗の申請は、運営が定める手続に従って行うものとし、運営は申請を承認しない場合があります。承認しない理由の開示義務は負いません。<br />
              3. 在籍紐づけ、申請・承認・解除などの機能は、サービス仕様の変更により手続が追加・変更されることがあります。
            </p>

            <h2 className="policy-heading">第6条（コンテンツの取扱い・権利）</h2>
            <p className="policy-text">
              1. 会員は、自らが投稿・送信したコンテンツについて、適法な権利（著作権、肖像権、利用許諾等）を有することを保証します。<br />
              2. コンテンツの著作権は原則として投稿者に帰属します。<br />
              3. 投稿者は、運営に対し、本サービスの提供・維持・改善、表示・配信、機能実装（レイアウト変更、リサイズ、圧縮等の改変を含む）、
              不正利用対策、統計分析・品質改善の目的の範囲で、当該コンテンツを無償で利用（複製、公衆送信、翻案・編集を含む）する非独占的な権利を許諾します。<br />
              4. 会員は、運営がコンテンツのバックアップや保存を保証しないことをあらかじめ了承します。
            </p>

            <h2 className="policy-heading">第7条（禁止事項）</h2>
            <p className="policy-text">
              利用者は、本サービスの利用にあたり、以下の行為をしてはなりません。
            </p>
            <ul className="policy-list">
              <li>法令または公序良俗に反する行為、またはそれらを助長する行為</li>
              <li>18歳未満の利用、未成年の勧誘、未成年に関する性的表現・搾取・誘導</li>
              <li>詐欺、脅迫、恐喝、強要、嫌がらせ、ストーキング、暴力的・差別的言動</li>
              <li>第三者の権利侵害（著作権、商標権、肖像権、プライバシー等）</li>
              <li>個人情報の公開・収集・開示（住所、電話、勤務先、特定可能なSNS等を含む）</li>
              <li>なりすまし、虚偽情報の登録、運営や他者を誤認させる行為</li>
              <li>スパム、同一内容の過度な連投、機械的な勧誘、過度な宣伝・営業</li>
              <li>外部サービスへの不適切な誘導（詐欺的誘導、規約違反を伴う誘導、無差別DM等）</li>
              <li>本サービスのサーバー・ネットワーク・セキュリティを妨害する行為</li>
              <li>通報の悪用（虚偽通報、報復目的、嫌がらせ目的）</li>
              <li>その他、運営が不適切と判断する行為</li>
            </ul>

            <h2 className="policy-heading">第8条（DM・外部連絡・安全）</h2>
            <p className="policy-text">
              1. DM機能は、仕様上の制限が設けられる場合があります（例：一般ユーザー同士のDMを制限する等）。<br />
              2. 利用者は、DMや外部連絡先の交換において、個人情報や金銭取引に関するリスクを理解し、自らの責任で慎重に行動するものとします。<br />
              3. 不快・危険を感じた場合、利用者はブロック/ミュート/通報等の機能を利用できます。運営は通報を確認し必要に応じて対応しますが、即時対応を保証するものではありません。
            </p>

            <h2 className="policy-heading">第9条（外部決済・取引の非関与）</h2>
            <p className="policy-text">
              1. 本サービスは、利用者間（一般ユーザー・セラピスト・店舗を含む）における外部決済、金銭の授受、役務提供、契約の成立・履行等の取引に関与しません。<br />
              2. 利用者間で発生した金銭トラブル、契約不履行、返金・キャンセル等の紛争について、運営は責任を負いません。<br />
              3. 運営が安全確保の観点から必要と判断した場合、取引に関連する疑いのあるアカウント・投稿・DM等に対し、制限・調査・措置を行うことがあります。
            </p>

            <h2 className="policy-heading">第10条（違反対応・強制措置）</h2>
            <p className="policy-text">
              1. 運営は、利用者が本規約または個別規定に違反した、またはそのおそれがあると判断した場合、
              事前通知なく、コンテンツの削除・非表示、機能制限、アカウント停止等の措置を行うことができます。<br />
              2. 重大な危険（未成年、詐欺、脅迫等）が疑われる場合、運営は優先して対応し、必要に応じて関係機関への相談等を行う場合があります。<br />
              3. 運営は、これら措置の理由を開示する義務を負いません。
            </p>

            <h2 className="policy-heading">第11条（有料機能・課金）</h2>
            <p className="policy-text">
              1. 本サービスは将来、有料機能、手数料、サブスクリプション等を導入する場合があります。導入する場合、運営は事前に本サービス上で告知します。<br />
              2. 有料機能の提供条件、支払方法、返金条件等は、運営が別途定めるところによります。
            </p>

            <h2 className="policy-heading">第12条（利用環境・障害・メンテナンス）</h2>
            <p className="policy-text">
              1. 本サービスの利用には、インターネット接続環境および対応端末が必要です。通信料等は利用者の負担となります。<br />
              2. 運営は、本サービスがすべての端末・ブラウザ・通信環境で正常に動作することを保証しません。推奨環境は以下のとおりですが、推奨環境でも動作を保証するものではありません。
            </p>
            <ul className="policy-list">
              {RECOMMENDED_ENV.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <p className="policy-text">
              3. 運営は、保守点検、障害対応、負荷対策、セキュリティ対応等のため、予告なく本サービスの全部または一部を停止・制限することがあります。<br />
              4. 前項により利用者に損害が生じた場合であっても、運営は責任を負いません。ただし運営に故意または重過失がある場合はこの限りではありません。
            </p>

            <h2 className="policy-heading">第13条（サービスの変更・停止・終了）</h2>
            <p className="policy-text">
              運営は、運営上または技術上の必要により、本サービスの内容を変更し、または提供を一時停止・終了することができます。
              重大な変更がある場合は、可能な範囲で事前に告知しますが、緊急時はこの限りではありません。
            </p>

            <h2 className="policy-heading">第14条（免責）</h2>
            <p className="policy-text">
              1. 運営は、本サービスが常に利用可能であること、欠陥がないこと、特定目的への適合性等を保証しません。<br />
              2. 利用者間、または利用者と第三者（外部サービス、店舗、個人等）との間で生じたトラブルについて、運営は責任を負いません。<br />
              3. 運営の責任が認められる場合でも、運営に故意または重過失がある場合を除き、運営の責任範囲は通常生ずべき直接かつ現実の損害に限られます。
            </p>

            <h2 className="policy-heading">第15条（退会・データの取扱い）</h2>
            <p className="policy-text">
              1. 会員は、運営が定める方法により退会できます。<br />
              2. 退会後も、法令遵守、不正対策、紛争対応等の目的で、一定期間ログ等が保持される場合があります。<br />
              3. 退会により、投稿・DM等が直ちにすべて削除されることを保証するものではありません（他者との整合性や不正対策の観点から、匿名化または一部保持される場合があります）。
            </p>

            <h2 className="policy-heading">第16条（反社会的勢力の排除）</h2>
            <p className="policy-text">
              1. 利用者は、自己が反社会的勢力（暴力団、暴力団員、暴力団関係企業・団体、総会屋、社会運動等標榜ゴロ、特殊知能暴力集団、その他これらに準ずる者）に該当しないこと、または関係を有しないことを表明し、将来にわたり確約するものとします。<br />
              2. 利用者が前項に違反した場合、運営は事前通知なく、当該利用者の利用停止、アカウント停止、コンテンツ削除等の措置を行うことができます。<br />
              3. 前項の措置により利用者に損害が生じた場合であっても、運営は責任を負いません。
            </p>

            <h2 className="policy-heading">第17条（問い合わせ窓口）</h2>
            <p className="policy-text">
              本サービスに関するお問い合わせは、以下よりご連絡ください。内容により、回答に時間を要する場合や、回答できない場合があります。
            </p>
            <p className="policy-text">
              問い合わせ先：
              <a className="policy-link" href={CONTACT_URL}>
                {CONTACT_URL}
              </a>
            </p>

            <h2 className="policy-heading">第18条（規約の変更）</h2>
            <p className="policy-text">
              運営は、本規約を適宜変更することができます。重要な変更がある場合は、本サービス上で告知します。
              変更後に利用者が本サービスを利用した場合、変更後の本規約に同意したものとみなされます。
            </p>

            <h2 className="policy-heading">第19条（準拠法・管轄）</h2>
            <p className="policy-text">
              本規約の解釈にあたっては日本法を準拠法とします。
              本サービスに起因または関連して生じる紛争については、運営の所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。
            </p>

            <p className="policy-footer-note">
              制定日：2025年12月19日（ベータ版）<br />
              本規約は、開発・運用状況に応じて随時更新されます。
            </p>
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

        .policy-link {
          margin-left: 6px;
          color: inherit;
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        .policy-footer-note {
          margin: 10px 0 0;
          font-size: 11px;
          color: var(--text-sub);
          text-align: right;
          line-height: 1.7;
        }
      `}</style>
    </div>
  );
}