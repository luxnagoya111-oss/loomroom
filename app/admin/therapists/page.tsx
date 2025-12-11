// app/admin/therapists/page.tsx
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

type TherapistSignup = DbSignupApplicationRow;

export default function AdminTherapistsPage() {
  const [items, setItems] = useState<TherapistSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // ★ セラピスト申請だけ取得
        const rows = await listSignupApplications({ type: "therapist" });
        if (cancelled) return;
        setItems(rows);
      } catch (err) {
        console.error("[AdminTherapistsPage] load error:", err);
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
      console.error("[AdminTherapistsPage] update error:", err);
      setError("ステータス更新に失敗しました。");
    } finally {
      setUpdatingId(null);
    }
  };

  const renderRow = (app: TherapistSignup) => {
    const payload = (app.payload ?? {}) as any;

    // /signup/creator/start の TherapistForm に合わせて読む
    const area: string = payload.area ?? "";
    const experience: string = payload.experience ?? "";
    const wishStore: string = payload.wishStore ?? "";
    const note: string = payload.note ?? "";

    // contact はカラム or payload のどちらか
    const contact: string = app.contact ?? payload.contact ?? "";

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
          {wishStore && <div className="sub">希望店舗: {wishStore}</div>}
          {experience && (
            <div className="sub">
              経験/背景:{" "}
              {experience.length > 40
                ? experience.slice(0, 40) + "…"
                : experience}
            </div>
          )}
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
      <AppHeader title="セラピスト申請一覧" />
      <main className="app-main">
        <div className="page-root">
          <p className="page-lead">
            /signup/creator から送信された
            <strong>セラピスト向け</strong>の signup_applications を表示しています。
            ステータスを approved / rejected に変更すると、審査結果が確定した扱いになります。
            （users.role の変更や therapists への本登録は、別途 /admin 実装で行います）
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
                    <th className="th main-cell">セラピスト情報</th>
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

      {/* スタイルは stores と共通でOK */}
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