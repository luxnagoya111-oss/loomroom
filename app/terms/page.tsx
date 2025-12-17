"use client";

import React from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { getCurrentUserId } from "@/lib/auth";

// ★ ログインユーザーID／未読フラグ
const currentUserId = getCurrentUserId();
const hasUnread = false;

export default function TermsPage() {
  return (
    <div className="policy-shell">
      <AppHeader title="利用規約" />

      <main className="policy-main">
        <section className="policy-section">
          <h1 className="policy-title">LRoom 利用規約（案）</h1>
          <p className="policy-description">
            このページは、LRoomの利用ルールを整理するための
            ベータ版の利用規約案です。正式公開の前に、内容を見直し、
            必要に応じて専門家の確認を受けた上で改定します。
          </p>

          <div className="policy-card">
            <h2 className="policy-heading">第1条（本規約の適用）</h2>
            <p className="policy-text">
              本規約は、LRoom（以下「本サービス」といいます）の利用条件を定めるものです。
              利用者は、本サービスを利用することにより、本規約に同意したものとみなされます。
            </p>

            <h2 className="policy-heading">第2条（アカウント）</h2>
            <p className="policy-text">
              1. 本サービスは、原則18歳以上の方のみ利用できます。
              <br />
              2.
              アカウントは、一般ユーザー・セラピスト・店舗といった区分ごとに運営側が定めるルールに沿って発行されます。
              <br />
              3.
              利用者は、登録情報に虚偽がないよう注意し、自身の責任で管理するものとします。
            </p>

            <h2 className="policy-heading">第3条（パスワード等の管理）</h2>
            <p className="policy-text">
              1.
              利用者は、ログイン情報を第三者に共有せず、自身の責任で管理するものとします。
              <br />
              2.
              ログイン情報の管理不備によって生じたトラブルについて、運営は責任を負いません。
            </p>

            <h2 className="policy-heading">第4条（禁止事項）</h2>
            <p className="policy-text">
              利用者は、本サービスの利用にあたり、以下の行為をしてはなりません。
            </p>
            <ul className="policy-list">
              <li>法令または公序良俗に反する行為</li>
              <li>第三者への差別・誹謗中傷・嫌がらせ</li>
              <li>プラットフォームの趣旨に反する宣伝・勧誘行為</li>
              <li>なりすましや虚偽情報による登録</li>
              <li>運営が不適切と判断する投稿やDMの送信</li>
            </ul>

            <h2 className="policy-heading">第5条（コンテンツの取り扱い）</h2>
            <p className="policy-text">
              1.
              利用者が本サービス上に投稿したテキスト・画像等のコンテンツは、利用者自身がその責任を負うものとします。
              <br />
              2.
              運営は、サービスの改善や不具合調査のため、投稿内容や利用ログを統計的に利用する場合があります。
            </p>

            <h2 className="policy-heading">第6条（サービスの変更・停止）</h2>
            <p className="policy-text">
              運営は、事前の予告なく、本サービスの内容の変更・一時停止・終了を行うことができます。
              重大な変更がある場合は、可能な範囲で本サービス上にてお知らせします。
            </p>

            <h2 className="policy-heading">第7条（免責）</h2>
            <p className="policy-text">
              1.
              運営は、本サービスに関して、事実上または法律上の瑕疵がないことを保証するものではありません。
              <br />
              2.
              利用者同士、または利用者と第三者との間で生じたトラブルについて、運営は直接の責任を負いません。
            </p>

            <h2 className="policy-heading">第8条（規約の変更）</h2>
            <p className="policy-text">
              運営は、本規約を適宜変更することができます。
              重要な変更がある場合には、本サービス上でその旨を掲示するものとします。
            </p>

            <h2 className="policy-heading">第9条（準拠法・管轄）</h2>
            <p className="policy-text">
              本規約の解釈にあたっては、日本法を準拠法とします。
              本サービスに起因または関連して生じる紛争については、
              運営の所在地を管轄する裁判所を第一審の専属的合意管轄とします。
            </p>

            <p className="policy-footer-note">
              ※この利用規約は、LRoomの企画・開発段階における案です。
              実際のサービス公開時には、内容を見直したうえで、必要に応じて専門家の確認を行ったのち正式版を掲載します。
            </p>
          </div>
        </section>
      </main>

      <BottomNav
        active="mypage"
        hasUnread={hasUnread}
      />
    </div>
  );
}