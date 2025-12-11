// app/admin/stores/page.tsx
"use client";

import React, { useEffect, useState, ChangeEvent } from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import {
  listSignupApplications,
  updateSignupStatus,
  approveStoreSignup,   // ← 追加
} from "@/lib/repositories/signupRepository";
import type { DbSignupApplicationRow, DbSignupStatus } from "@/types/db";

const hasUnread = false; // 管理画面なので一旦 false のまま

type StoreSignup = DbSignupApplicationRow;

export default function AdminStoresPage() {
  const [items, setItems] = useState<StoreSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await listSignupApplications({ type: "store" });
        if (cancelled) return;
        setItems(rows);
      } catch (err) {
        console.error("[AdminStoresPage] load error:", err);
        if (!cancelled) {
          setError("読み込みに失敗しました。");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStatusChange = async (
    id: string,
    status: DbSignupStatus
  ) => {
    setUpdatingId(id);
    try {
      let updated: DbSignupApplicationRow | null = null;

      if (status === "approved") {
        // store 承認フロー：stores 作成＋role 更新＋status 更新を一括で
        updated = await approveStoreSignup(id);
      } else {
        // pending / rejected など、単純に status だけ変えたいケースはこちら
        updated = await updateSignupStatus({ id, status });
      }

      if (!updated) {
        setError("ステータス更新に失敗しました。");
        return;
      }

      setItems((prev) =>
        prev.map((item) => (item.id === id ? updated : item))
      );
    } catch (err) {
      console.error("[AdminStoresPage] update error:", err);
      setError("ステータス更新に失敗しました。");
    } finally {
      setUpdatingId(null);
    }
  };

  const renderRow = (app: StoreSignup) => {
    const payload = (app.payload ?? {}) as any;
    const area = payload.area ?? "";
    const contactName = payload.contactName ?? "";
    const website = payload.website ?? "";
    const note = payload.note ?? "";
    const contact = app.contact ?? payload.contact ?? "";

    const created = app.created_at
      ? new Date(app.created_at).toLocaleString("ja-JP", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

    return (
      <tr key={app.id} className="row">
        <td className="cell main-cell">
          <div className="name">{app.name}</div>
          {area && <div className="sub">エリア: {area}</div>}
          {contactName && <div className="sub">担当: {contactName}</div>}
          {website && <div className="sub">Web: {website}</div>}
        </td>
        <td className="cell contact-cell">
          {contact && <div className="sub">{contact}</div>}
          <div className="date">{created}</div>
        </td>
        <td className="cell note-cell">
          {note && <div className="sub">{note}</div>}
        </td>
        <td className="cell status-cell">
          <select
            className="status-select"
            value={app.status}
            disabled={updatingId === app.id}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              handleStatusChange(app.id, e.target.value as DbSignupStatus)
            }
          >
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
          </select>
        </td>
      </tr>
    );
  };

  return (
    <div className="app-shell">
      <AppHeader title="店舗申請一覧" />
      <main className="app-main">
        <div className="page-root">
          <p className="page-lead">
            /signup/creator から送信された店舗向けの signup_applications を表示しています。
            ステータスを approved にすると「店舗の本登録」「users.role の更新」まで自動で行われます。
            rejected にした場合は申請のみ更新されます。
          </p>

          {loading ? (
            <div className="status-message">読み込み中...</div>
          ) : error ? (
            <div className="status-message error">{error}</div>
          ) : items.length === 0 ? (
            <div className="status-message">まだ申請はありません。</div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th className="th main-cell">店舗情報</th>
                    <th className="th contact-cell">連絡先 / 申請日時</th>
                    <th className="th note-cell">補足</th>
                    <th className="th status-cell">ステータス</th>
                  </tr>
                </thead>
                <tbody>{items.map(renderRow)}</tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <BottomNav hasUnread={hasUnread} />

      {/* スタイルはそのまま */}
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

        .page-root {
          max-width: 960px;
          margin: 0 auto;
        }

        .page-lead {
          font-size: 12px;
          color: var(--text-sub, #666);
          line-height: 1.7;
          margin-bottom: 12px;
        }

        .status-message {
          font-size: 13px;
          color: var(--text-sub, #555);
          padding: 12px;
        }

        .status-message.error {
          color: #b94a48;
        }

        .table-wrapper {
          overflow-x: auto;
          border-radius: 12px;
          border: 1px solid rgba(220, 210, 200, 0.9);
          background: #fff;
        }

        .table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }

        .th {
          text-align: left;
          padding: 8px 10px;
          border-bottom: 1px solid #eee3d8;
          background: #fdf8f1;
          white-space: nowrap;
        }

        .cell {
          padding: 8px 10px;
          border-bottom: 1px solid #f3e7d8;
          vertical-align: top;
        }

        .row:last-child .cell {
          border-bottom: none;
        }

        .main-cell {
          min-width: 180px;
        }

        .contact-cell {
          min-width: 160px;
        }

        .note-cell {
          min-width: 180px;
          max-width: 240px;
        }

        .status-cell {
          min-width: 120px;
        }

        .name {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 2px;
        }

        .sub {
          font-size: 11px;
          color: var(--text-sub, #777);
          line-height: 1.5;
        }

        .date {
          font-size: 11px;
          color: var(--text-sub, #999);
          margin-top: 4px;
        }

        .status-select {
          font-size: 12px;
          border-radius: 999px;
          border: 1px solid var(--border, #ddd);
          padding: 4px 8px;
          background: #fff;
        }
      `}</style>
    </div>
  );
}