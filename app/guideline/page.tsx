"use client";

import React from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { getCurrentUserId } from "@/lib/auth";

const currentUserId = getCurrentUserId();
const hasUnread = false;

export default function GuidelinePage() {
  return (
    <div className="policy-shell">
      <AppHeader title="ガイドライン" />

      <main className="policy-main">
        <section className="policy-section">
          <h1 className="policy-title">コミュニティガイドライン（案）</h1>

          <p className="policy-description">
            LRoom を安全に使うための基本的なルールをまとめた
            ベータ版のガイドラインです。正式公開の前に内容を見直し、
            必要に応じて改定していきます。
          </p>

          <div className="policy-card">
            <h2 className="policy-heading">1. 年齢について</h2>
            <p className="policy-text">
              本サービスは、18歳以上の方のみ利用できます。
              18歳未満の方の登録・利用・投稿・DMはできません。
            </p>

            <h2 className="policy-heading">
              2. 投稿・プロフィールで禁止される内容
            </h2>
            <p className="policy-text">
              以下に該当する投稿やプロフィール内容は禁止とします。
            </p>
            <ul className="policy-list">
              <li>法令違反またはそのおそれのある内容</li>
              <li>未成年に関する性的な表現や出会いの募集</li>
              <li>特定の個人や店舗への誹謗中傷・攻撃的な表現</li>
              <li>差別的・暴力的な表現</li>
              <li>スパム・同一内容の過度な連投</li>
              <li>他サービスの規約に反する宣伝・勧誘行為</li>
            </ul>

            <h2 className="policy-heading">3. DM の使い方</h2>
            <p className="policy-text">
              一般ユーザーからセラピストへの DM
              を想定しています（一般ユーザー同士の DM は原則不可）。
              不快なメッセージを受け取った場合は、ミュート・ブロック・通報を検討してください。
            </p>
            <p className="policy-text">
              また、フルネーム・住所・電話番号などの個人情報は、
              必要最小限の範囲で慎重にやり取りしてください。
            </p>

            <h2 className="policy-heading">4. 通報・ブロックについて</h2>
            <p className="policy-text">
              規約やガイドラインに反していると思われる投稿・プロフィール・DM
              は、通報機能から運営に知らせることができます。
            </p>
            <p className="policy-text">
              通報内容は運営が確認し、必要に応じて投稿の非表示やアカウント制限等の対応を行います。
              現時点ではベータ版のため、対応に時間がかかる場合があります。
            </p>

            <h2 className="policy-heading">5. アカウントの制限</h2>
            <p className="policy-text">
              本ガイドラインや利用規約に反する行為が確認された場合、
              事前の通知なく投稿の削除・アカウントの一時停止・利用禁止などの措置を行うことがあります。
            </p>

            <h2 className="policy-heading">6. ガイドラインの変更</h2>
            <p className="policy-text">
              サービスの運営状況や関連する外部サービスの規約変更などに応じて、
              本ガイドラインの内容を適宜改定します。
              重要な変更がある場合は、本サービス上でお知らせします。
            </p>

            <p className="policy-footer-note">
              制定日：2025年12月（ベータ版）<br />
              LRoom の実際の運用状況を見ながら、随時見直し・調整していきます。
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