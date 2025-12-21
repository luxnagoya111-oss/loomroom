// app/admin/users/page.tsx
"use client";

import React, { useEffect, useMemo, useState, ChangeEvent } from "react";
import {
  listSignupApplications,
  updateSignupStatus,
} from "@/lib/repositories/signupRepository";
import type { DbSignupApplicationRow, DbSignupStatus } from "@/types/db";

type UserSignup = DbSignupApplicationRow;

function formatCreatedAt(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(s: DbSignupStatus) {
  if (s === "pending") return "審査待ち";
  if (s === "approved") return "承認";
  if (s === "rejected") return "却下";
  return s;
}

function clip(s: string, n = 240) {
  const t = (s ?? "").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

export default function AdminUsersPage() {
  const [items, setItems] = useState<UserSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await listSignupApplications({ type: "user" });
        if (cancelled) return;
        setItems(rows);
      } catch (err) {
        console.error("[AdminUsersPage] load error:", err);
        if (!cancelled) setError("読み込みに失敗しました。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;

    return items.filter((app) => {
      const payload = (app.payload ?? {}) as any;

      const name = String(app.name ?? "");
      const contact = String(app.contact ?? payload.contact ?? "");
      const currentUserId = String(payload.currentUserId ?? "");
      const hopes = String(payload.hopes ?? "");
      const howToUse = String(payload.howToUse ?? "");

      return [name, contact, currentUserId, hopes, howToUse]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [items, q]);

  const handleStatusChange = async (id: string, status: DbSignupStatus) => {
    setUpdatingId(id);
    setError(null);

    try {
      const updated = await updateSignupStatus({ id, status });
      if (!updated) {
        setError("ステータス更新に失敗しました。");
        return;
      }
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
    } catch (err) {
      console.error("[AdminUsersPage] update error:", err);
      setError("ステータス更新に失敗しました。");
    } finally {
      setUpdatingId(null);
    }
  };

  const renderRow = (app: UserSignup) => {
    const payload = (app.payload ?? {}) as any;

    const contact = app.contact ?? payload.contact ?? "";
    const currentUserId = payload.currentUserId ?? "";
    const hopes = payload.hopes ?? "";
    const howToUse = payload.howToUse ?? "";
    const created = formatCreatedAt(app.created_at);

    return (
      <tr key={app.id} className="row">
        <td className="cell main-cell">
          <div className="name">{app.name}</div>
          <div className="meta">
            {currentUserId && <span className="pill">仮ユーザーID: {currentUserId}</span>}
          </div>
        </td>

        <td className="cell contact-cell">
          {contact ? <div className="sub">{contact}</div> : <div className="sub muted">—</div>}
          <div className="date">{created}</div>
        </td>

        <td className="cell hopes-cell">
          {hopes ? <div className="note-text">{hopes}</div> : <div className="sub muted">—</div>}
        </td>

        <td className="cell howto-cell">
          {howToUse ? (
            <div className="note-text">{howToUse}</div>
          ) : (
            <div className="sub muted">—</div>
          )}
        </td>

        <td className="cell status-cell">
          <div className={`status-chip status-${app.status}`}>{statusLabel(app.status)}</div>

          <select
            className="status-select"
            value={app.status}
            disabled={updatingId === app.id}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              handleStatusChange(app.id, e.target.value as DbSignupStatus)
            }
          >
            <option value="pending">審査待ち</option>
            <option value="approved">承認</option>
            <option value="rejected">却下</option>
          </select>

          {updatingId === app.id && <div className="sub muted">更新中…</div>}
        </td>
      </tr>
    );
  };

  const renderCard = (app: UserSignup) => {
    const payload = (app.payload ?? {}) as any;

    const contact = app.contact ?? payload.contact ?? "";
    const currentUserId = payload.currentUserId ?? "";
    const hopes = payload.hopes ?? "";
    const howToUse = payload.howToUse ?? "";
    const created = formatCreatedAt(app.created_at);

    return (
      <div key={app.id} className="card">
        <div className="card-head">
          <div className="card-title">{app.name}</div>
          <div className={`status-chip status-${app.status}`}>{statusLabel(app.status)}</div>
        </div>

        <div className="card-meta">
          {currentUserId && (
            <div className="kv">
              <span className="k">仮ユーザーID</span>
              <span className="v">{currentUserId}</span>
            </div>
          )}
          {contact && (
            <div className="kv">
              <span className="k">連絡先</span>
              <span className="v">{contact}</span>
            </div>
          )}
          {created && (
            <div className="kv">
              <span className="k">申請日時</span>
              <span className="v">{created}</span>
            </div>
          )}
        </div>

        {hopes && (
          <div className="card-note">
            <div className="k">できたら嬉しいこと</div>
            <div className="v">{clip(hopes, 260)}</div>
          </div>
        )}

        {howToUse && (
          <div className="card-note">
            <div className="k">使い方イメージ</div>
            <div className="v">{clip(howToUse, 260)}</div>
          </div>
        )}

        <div className="card-actions">
          <select
            className="status-select"
            value={app.status}
            disabled={updatingId === app.id}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              handleStatusChange(app.id, e.target.value as DbSignupStatus)
            }
          >
            <option value="pending">審査待ち</option>
            <option value="approved">承認</option>
            <option value="rejected">却下</option>
          </select>

          {updatingId === app.id && <div className="sub muted">更新中…</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="page-root">
      <div className="page-head">
        <div>
          <h1 className="page-title">一般ユーザー申請</h1>
          <p className="page-lead">
            /signup/user から送信された一般ユーザー申請（signup_applications）を表示します。
            ステータスを approved / rejected に変更すると審査結果が確定した扱いになります。
          </p>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="名前 / 連絡先 / 仮ユーザーID / できたら嬉しいこと / 使い方イメージ を検索"
        />
        <div className="count">{filtered.length} 件</div>
      </div>

      {loading ? (
        <div className="status-message">読み込み中...</div>
      ) : error ? (
        <div className="status-message error">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="status-message">まだ申請はありません。</div>
      ) : (
        <>
          <div className="table-only">
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
                <tbody>{filtered.map(renderRow)}</tbody>
              </table>
            </div>
          </div>

          <div className="card-only">{filtered.map(renderCard)}</div>
        </>
      )}

      <style jsx>{`
        .page-root {
          max-width: 1100px;
          margin: 0 auto;
        }

        .page-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }

        .page-title {
          font-size: 18px;
          font-weight: 800;
          letter-spacing: 0.02em;
          margin-bottom: 4px;
        }

        .page-lead {
          font-size: 12px;
          color: var(--text-sub, #6b7280);
          line-height: 1.7;
        }

        .toolbar {
          display: flex;
          gap: 10px;
          align-items: center;
          margin: 10px 0 10px;
        }

        .search {
          flex: 1;
          border-radius: 999px;
          border: 1px solid var(--border, rgba(220, 210, 200, 0.9));
          padding: 9px 12px;
          font-size: 12px;
          background: var(--surface-soft, rgba(255, 255, 255, 0.92));
          color: inherit;
          outline: none;
        }

        .search:focus {
          border-color: rgba(215, 185, 118, 0.9);
          box-shadow: 0 0 0 2px rgba(215, 185, 118, 0.18);
          background: var(--surface, #fff);
        }

        .count {
          font-size: 12px;
          color: var(--text-sub, #6b7280);
          white-space: nowrap;
        }

        .status-message {
          font-size: 13px;
          color: var(--text-sub, #6b7280);
          padding: 12px 2px;
        }
        .status-message.error {
          color: #b94a48;
        }

        /* ===== Table ===== */
        .table-wrapper {
          overflow-x: auto;
          border-radius: 12px;
          border: 1px solid var(--border, rgba(220, 210, 200, 0.9));
          background: var(--surface, #fff);
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.03);
        }

        .table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }

        .th {
          text-align: left;
          padding: 10px 10px;
          border-bottom: 1px solid var(--border-light, rgba(0, 0, 0, 0.06));
          background: var(--surface-soft, rgba(255, 255, 255, 0.9));
          white-space: nowrap;
        }

        .cell {
          padding: 10px 10px;
          border-bottom: 1px solid var(--border-light, rgba(0, 0, 0, 0.06));
          vertical-align: top;
        }
        .row:last-child .cell {
          border-bottom: none;
        }

        .main-cell {
          min-width: 240px;
        }
        .contact-cell {
          min-width: 220px;
        }
        .hopes-cell {
          min-width: 320px;
          max-width: 460px;
        }
        .howto-cell {
          min-width: 320px;
          max-width: 460px;
        }
        .status-cell {
          min-width: 170px;
        }

        .name {
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 6px;
        }

        .meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .pill {
          font-size: 11px;
          color: var(--text-sub, #6b7280);
          background: var(--surface-soft, rgba(255, 255, 255, 0.9));
          border: 1px solid var(--border-light, rgba(0, 0, 0, 0.06));
          padding: 3px 8px;
          border-radius: 999px;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .sub {
          font-size: 11px;
          color: var(--text-sub, #6b7280);
          line-height: 1.5;
        }
        .muted {
          opacity: 0.72;
        }

        .date {
          font-size: 11px;
          color: var(--text-sub, #6b7280);
          opacity: 0.85;
          margin-top: 6px;
        }

        .note-text {
          font-size: 12px;
          line-height: 1.6;
          color: var(--text-main, #111827);
          opacity: 0.85;
          white-space: pre-wrap;
          word-break: break-word;
        }

        /* ===== Status ===== */
        .status-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid var(--border-light, rgba(0, 0, 0, 0.06));
          background: var(--surface-soft, rgba(255, 255, 255, 0.9));
          margin-bottom: 6px;
        }

        .status-pending {
          color: #8a6d3b;
          background: rgba(243, 215, 163, 0.22);
          border-color: rgba(243, 215, 163, 0.75);
        }
        .status-approved {
          color: #1b6b44;
          background: rgba(191, 228, 207, 0.22);
          border-color: rgba(191, 228, 207, 0.75);
        }
        .status-rejected {
          color: #8c2e2b;
          background: rgba(245, 194, 192, 0.22);
          border-color: rgba(245, 194, 192, 0.75);
        }

        .status-select {
          font-size: 12px;
          border-radius: 999px;
          border: 1px solid var(--border, rgba(220, 210, 200, 0.9));
          padding: 6px 10px;
          background: var(--surface, #fff);
          color: inherit;
          width: 100%;
          max-width: 160px;
          outline: none;
        }

        .status-select:focus {
          border-color: rgba(215, 185, 118, 0.9);
          box-shadow: 0 0 0 2px rgba(215, 185, 118, 0.16);
        }

        /* ===== Cards (mobile) ===== */
        .card {
          background: var(--surface, #fff);
          border: 1px solid var(--border, rgba(220, 210, 200, 0.9));
          border-radius: 16px;
          padding: 12px 12px 10px;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.03);
        }
        .card + .card {
          margin-top: 10px;
        }

        .card-head {
          display: flex;
          gap: 10px;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .card-title {
          font-size: 14px;
          font-weight: 800;
          color: var(--text-main, #111827);
          line-height: 1.3;
        }

        .card-meta {
          display: grid;
          gap: 6px;
        }

        .kv {
          display: grid;
          grid-template-columns: 90px 1fr;
          gap: 8px;
          align-items: start;
        }

        .k {
          font-size: 11px;
          color: var(--text-sub, #6b7280);
        }

        .v {
          font-size: 12px;
          color: var(--text-main, #111827);
          opacity: 0.85;
          word-break: break-word;
          white-space: pre-wrap;
        }

        .card-note {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid var(--border-light, rgba(0, 0, 0, 0.06));
        }

        .card-actions {
          display: flex;
          gap: 10px;
          align-items: center;
          justify-content: space-between;
          margin-top: 10px;
        }

        .table-only {
          display: block;
        }
        .card-only {
          display: none;
        }

        /* ★ layout.tsx と同じ 860px で切り替える */
        @media (max-width: 860px) {
          .table-only {
            display: none;
          }
          .card-only {
            display: grid;
          }
          .status-select {
            max-width: 100%;
          }
          .toolbar {
            flex-direction: column;
            align-items: stretch;
          }
          .count {
            text-align: right;
          }
        }
      `}</style>
    </div>
  );
}