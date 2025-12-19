// app/admin/page.tsx
"use client";

import React from "react";
import Link from "next/link";

export default function AdminHomePage() {
  return (
    <div className="page-root">
      <h1 className="page-title">管理ダッシュボード</h1>
      <p className="page-lead">
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
        .page-root {
          max-width: 1100px;
          margin: 0 auto;
        }

        .page-title {
          font-size: 18px;
          font-weight: 800;
          letter-spacing: 0.02em;
          margin-bottom: 6px;
        }

        .page-lead {
          font-size: 12px;
          color: var(--text-sub, #6b7280);
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
          border: 1px solid var(--border, rgba(220, 210, 200, 0.9));
          background: var(--surface-soft, #fff);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          transition: transform 0.08s ease, border-color 0.08s ease,
            box-shadow 0.08s ease;
        }

        .admin-card:hover {
          transform: translateY(-1px);
          border-color: rgba(215, 185, 118, 0.55);
          box-shadow: 0 10px 24px rgba(10, 10, 10, 0.04);
        }

        .admin-card-title {
          font-size: 14px;
          font-weight: 800;
          color: #2d2620;
        }

        .admin-card-desc {
          font-size: 11px;
          color: var(--text-sub, #6b7280);
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