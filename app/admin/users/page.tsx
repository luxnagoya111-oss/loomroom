// app/admin/users/page.tsx
"use client";

import React, { useEffect, useState, ChangeEvent } from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import {
  listSignupApplications,
  updateSignupStatus,
} from "@/lib/repositories/signupRepository";
import type { DbSignupApplicationRow, DbSignupStatus } from "@/types/db";

const hasUnread = false; // 管理画面なので一旦 false のまま

type UserSignup = DbSignupApplicationRow;

export default function AdminUsersPage() {
  const [items, setItems] = useState<UserSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // type="user" の申請だけ取得
        const rows = await listSignupApplications({ type: "user" });
        if (cancelled) return;
        setItems(rows);
      } catch (err) {
        console.error("[AdminUsersPage] load error:", err);
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
      const updated = await updateSignupStatus({ id, status });
      if (!updated) {
        setError("ステータス更新に失敗しました。");
        return;
      }
      setItems((prev) =>
        prev.map((item) => (item.id === id ? updated : item))
      );
    } catch (err) {
      console.error("[AdminUsersPage] update error:", err);
      setError("ステータス更新に失敗しました。");
    } finally {
      setUpdatingId(null);
    }
  };

  const renderRow = (app: UserSignup) => {
    const payload = (app.payload ?? {}) as any;
    const hopes = payload.hopes ?? "";
    const howToUse = payload.howToUse ?? "";
    const contact = app.contact ?? payload.contact ?? "";
    const currentUserId = payload.currentUserId ?? "";

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
          {currentUserId && (
            <div className="sub">仮ユーザーID: {currentUserId}</div>
          )}
        </td>
        <td className="cell contact-cell">
          {contact && <div className="sub">{contact}</div>}
          <div className="date">{created}</div>
        </td>
        <td className="cell hopes-cell">
          {hopes && (
            <div className="sub">
              <strong>できたら嬉しいこと:</strong>
              <br />
              {hopes}
            </div>
          )}
        </td>
        <td className="cell howto-cell">
          {howToUse && (
            <div className="sub">
              <strong>使い方イメージ:</strong>
              <br />
              {howToUse}
            </div>
          )}
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
      <AppHeader title="一般ユーザー申請一覧" />
      <main className="app-main">
        <div className="page-root">
          <p className="page-lead">
            /signup/user から送信された一般ユーザー向けの
            signup_applications を表示しています。
            ステータスを approved / rejected に変更すると、審査結果が確定した扱いになります。
            （users への本登録は、別途 /admin 実装で行います）
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
                    <th className="th main-cell">申請者</th>
                    <th className="th contact-cell">連絡先 / 申請日時</th>
                    <th className="th hopes-cell">できたら嬉しいこと</th>
                    <th className="th howto-cell">使い方イメージ</th>
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
          min-width: 160px;
        }

        .contact-cell {
          min-width: 160px;
        }

        .hopes-cell {
          min-width: 200px;
          max-width: 260px;
        }

        .howto-cell {
          min-width: 200px;
          max-width: 260px;
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