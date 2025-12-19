// app/admin/page.tsx
"use client";

import React from "react";
import Link from "next/link";

export default function AdminHomePage() {
  return (
    <div>
      <h1 className="admin-title">管理ダッシュボード</h1>
      <p className="admin-sub">
        各管理ページへ移動してください。PCでの閲覧・運用を前提に作っています。
      </p>

      <div className="admin-grid">
        <Link className="admin-card" href="/admin/contact">
          <div className="admin-card-title">問い合わせ</div>
          <div className="admin-card-desc">チケット確認・対応状況管理</div>
        </Link>

        <Link className="admin-card" href="/admin/stores">
          <div className="admin-card-title">店舗</div>
          <div className="admin-card-desc">店舗申請・情報確認</div>
        </Link>

        <Link className="admin-card" href="/admin/therapists">
          <div className="admin-card-title">セラピスト</div>
          <div className="admin-card-desc">在籍状況・紐づけ管理</div>
        </Link>

        <Link className="admin-card" href="/admin/users">
          <div className="admin-card-title">ユーザー</div>
          <div className="admin-card-desc">ユーザー情報の確認</div>
        </Link>
      </div>

      <style jsx>{`
        .admin-title {
          font-size: 18px;
          font-weight: 800;
          letter-spacing: 0.02em;
          margin-bottom: 6px;
        }
        .admin-sub {
          font-size: 12px;
          color: var(--text-sub);
          line-height: 1.7;
          margin-bottom: 14px;
        }
        .admin-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .admin-card {
          text-decoration: none;
          color: inherit;
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--surface-soft);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          transition: transform 0.08s ease, border-color 0.08s ease;
        }
        .admin-card:hover {
          transform: translateY(-1px);
          border-color: rgba(215, 185, 118, 0.55);
        }
        .admin-card-title {
          font-size: 14px;
          font-weight: 800;
        }
        .admin-card-desc {
          font-size: 11px;
          color: var(--text-sub);
          line-height: 1.6;
        }
        @media (max-width: 520px) {
          .admin-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}