"use client";

import React from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { getCurrentUserId } from "@/lib/auth";

const currentUserId = getCurrentUserId();
const hasUnread = false;

export default function PrivacyPage() {
  return (
    <div className="policy-shell">
      <AppHeader title="プライバシーポリシー" />

      <main className="policy-main">
        <section className="policy-section">
          <h1 className="policy-title">プライバシーポリシー（案）</h1>

          <p className="policy-description">
            LoomRoomのプライバシーポリシーについてまとめたベータ版です。
            正式公開前に内容を見直し、必要に応じて改定します。
          </p>

          <div className="policy-card">
            <h2 className="policy-heading">1. 取得する情報</h2>
            <p className="policy-text">
              本サービスでは、以下の情報を取得する場合があります。
            </p>
            <ul className="policy-list">
              <li>ニックネーム・表示名・アイコン画像</li>
              <li>投稿内容（テキスト・いいね等）</li>
              <li>DM 内容（※運営は常時監視しません）</li>
              <li>アクセスログ・端末情報など</li>
            </ul>

            <h2 className="policy-heading">2. 利用目的</h2>
            <p className="policy-text">
              取得した情報は、サービス運営・改善・不正防止のために利用します。
            </p>

            <h2 className="policy-heading">3. 第三者提供</h2>
            <p className="policy-text">
              個人を特定できる情報を第三者へ提供することはありません。
              法令に基づく場合を除きます。
            </p>

            <h2 className="policy-heading">4. 安全管理</h2>
            <p className="policy-text">
              漏えい・改ざん・不正アクセス等を防ぐため、必要な安全措置を講じます。
            </p>

            <h2 className="policy-heading">5. 未成年の利用</h2>
            <p className="policy-text">
              本サービスは18歳未満の方は利用できません。
            </p>

            <p className="policy-footer-note">
              制定日：2025年12月（ベータ版）
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