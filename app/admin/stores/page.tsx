// app/admin/stores/page.tsx
"use client";

import React, { useEffect, useMemo, useState, ChangeEvent } from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import type { DbSignupApplicationRow, DbSignupStatus } from "@/types/db";

const hasUnread = false;
type StoreSignup = DbSignupApplicationRow;

const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY ?? "";

async function adminFetch(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
  if (ADMIN_KEY) headers.set("x-admin-key", ADMIN_KEY);
  return fetch(input, { ...init, headers, cache: "no-store" });
}

async function apiGetStoreSignups(): Promise<StoreSignup[]> {
  const res = await adminFetch("/api/admin/store-signups?type=store", {
    method: "GET",
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(json.error ?? "failed");
  return (json.data ?? []) as StoreSignup[];
}

async function apiApproveStore(appId: string): Promise<StoreSignup> {
  const res = await adminFetch("/api/admin/approve-store", {
    method: "POST",
    body: JSON.stringify({ appId }),
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(json.error ?? "failed");
  return json.data as StoreSignup;
}

// ★ 承認とは別APIへ（pending / rejected 用）
async function apiUpdateSignupStatus(
  id: string,
  status: DbSignupStatus
): Promise<StoreSignup> {
  const res = await adminFetch("/api/admin/store-signups/status", {
    method: "POST",
    body: JSON.stringify({ id, status }),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(json.error ?? "failed");
  return json.data as StoreSignup;
}

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
  if (s === "approved") return "承認済み";
  if (s === "rejected") return "却下";
  return s;
}

export default function AdminStoresPage() {
  const [items, setItems] = useState<StoreSignup[]>([]);
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
        const rows = await apiGetStoreSignups();
        if (cancelled) return;
        setItems(rows);
      } catch (err) {
        console.error("[AdminStoresPage] load error:", err);
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
      const area = String(payload.area ?? "");
      const contactName = String(payload.contactName ?? "");
      const website = String(payload.website ?? "");
      const note = String(payload.note ?? "");
      const contact = String(app.contact ?? payload.contact ?? "");
      const name = String(app.name ?? "");
      return [name, area, contactName, website, note, contact].some((v) =>
        v.toLowerCase().includes(needle)
      );
    });
  }, [items, q]);

  const handleStatusChange = async (id: string, status: DbSignupStatus) => {
    setUpdatingId(id);
    setError(null);

    if (status === "approved") {
      const ok = window.confirm(
        "この申請を承認しますか？（店舗の本登録・users.role 更新まで実行されます）"
      );
      if (!ok) {
        setUpdatingId(null);
        return;
      }
    }

    try {
      let updated: StoreSignup;
      if (status === "approved") {
        updated = await apiApproveStore(id);
      } else {
        updated = await apiUpdateSignupStatus(id, status);
      }
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
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
    const created = formatCreatedAt(app.created_at);

    return (
      <tr key={app.id} className="row">
        <td className="cell main-cell">
          <div className="name">{app.name}</div>
          <div className="meta">
            {area && <span className="pill">エリア: {area}</span>}
            {contactName && <span className="pill">担当: {contactName}</span>}
            {website && <span className="pill">Web: {website}</span>}
          </div>
        </td>

        <td className="cell contact-cell">
          {contact && <div className="sub">{contact}</div>}
          <div className="date">{created}</div>
        </td>

        <td className="cell note-cell">
          {note ? <div className="note-text">{note}</div> : <div className="sub muted">—</div>}
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

  const renderCard = (app: StoreSignup) => {
    const payload = (app.payload ?? {}) as any;
    const area = payload.area ?? "";
    const contactName = payload.contactName ?? "";
    const website = payload.website ?? "";
    const note = payload.note ?? "";
    const contact = app.contact ?? payload.contact ?? "";
    const created = formatCreatedAt(app.created_at);

    return (
      <div key={app.id} className="card">
        <div className="card-head">
          <div className="card-title">{app.name}</div>
          <div className={`status-chip status-${app.status}`}>{statusLabel(app.status)}</div>
        </div>

        <div className="card-meta">
          {area && <div className="kv"><span className="k">エリア</span><span className="v">{area}</span></div>}
          {contactName && <div className="kv"><span className="k">担当</span><span className="v">{contactName}</span></div>}
          {website && <div className="kv"><span className="k">Web</span><span className="v">{website}</span></div>}
          {contact && <div className="kv"><span className="k">連絡先</span><span className="v">{contact}</span></div>}
          {created && <div className="kv"><span className="k">申請日時</span><span className="v">{created}</span></div>}
        </div>

        {note && (
          <div className="card-note">
            <div className="k">補足</div>
            <div className="v">{note}</div>
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
    <div className="app-shell">
      <AppHeader title="店舗申請一覧" />
      <main className="app-main">
        <div className="page-root">
          <p className="page-lead">
            /signup/creator から送信された店舗向けの申請一覧です。承認（approved）にすると「店舗の本登録」「users.role の更新」まで自動で行われます。
          </p>

          <div className="toolbar">
            <input
              className="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="店舗名 / 連絡先 / エリア / 補足 を検索"
            />
            <div className="count">{filtered.length} 件</div>
          </div>

          {loading ? (
            <div className="status-message">読み込み中...</div>
          ) : error ? (
            <div className="status-message error">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="status-message">該当する申請はありません。</div>
          ) : (
            <>
              <div className="table-only">
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
                    <tbody>{filtered.map(renderRow)}</tbody>
                  </table>
                </div>
              </div>

              <div className="card-only">{filtered.map(renderCard)}</div>
            </>
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
          margin-bottom: 10px;
        }

        .toolbar {
          display: flex;
          gap: 10px;
          align-items: center;
          margin-bottom: 10px;
        }
        .search {
          flex: 1;
          border-radius: 999px;
          border: 1px solid rgba(220, 210, 200, 0.9);
          padding: 9px 12px;
          font-size: 12px;
          background: #fff;
        }
        .count {
          font-size: 12px;
          color: var(--text-sub, #777);
          white-space: nowrap;
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
          padding: 10px 10px;
          border-bottom: 1px solid #eee3d8;
          background: #fdf8f1;
          white-space: nowrap;
        }
        .cell {
          padding: 10px 10px;
          border-bottom: 1px solid #f3e7d8;
          vertical-align: top;
        }
        .row:last-child .cell {
          border-bottom: none;
        }
        .main-cell {
          min-width: 220px;
        }
        .contact-cell {
          min-width: 200px;
        }
        .note-cell {
          min-width: 220px;
          max-width: 360px;
        }
        .status-cell {
          min-width: 160px;
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
          color: var(--text-sub, #666);
          background: #faf3ea;
          border: 1px solid #f0e1cf;
          padding: 3px 8px;
          border-radius: 999px;
        }

        .sub {
          font-size: 11px;
          color: var(--text-sub, #777);
          line-height: 1.5;
        }
        .muted {
          color: #999;
        }
        .date {
          font-size: 11px;
          color: var(--text-sub, #999);
          margin-top: 6px;
        }

        .note-text {
          font-size: 12px;
          line-height: 1.6;
          color: #5b5248;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .status-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(220, 210, 200, 0.9);
          background: #fff;
          margin-bottom: 6px;
        }
        .status-pending {
          color: #8a6d3b;
          background: #fff7e6;
          border-color: #f3d7a3;
        }
        .status-approved {
          color: #1b6b44;
          background: #eaf7f0;
          border-color: #bfe4cf;
        }
        .status-rejected {
          color: #8c2e2b;
          background: #fdecea;
          border-color: #f5c2c0;
        }

        .status-select {
          font-size: 12px;
          border-radius: 999px;
          border: 1px solid var(--border, #ddd);
          padding: 6px 10px;
          background: #fff;
          width: 100%;
          max-width: 160px;
        }

        .card {
          background: #fff;
          border: 1px solid rgba(220, 210, 200, 0.9);
          border-radius: 14px;
          padding: 12px 12px 10px;
          box-shadow: 0 8px 24px rgba(10, 10, 10, 0.02);
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
          color: #2d2620;
          line-height: 1.3;
        }
        .card-meta {
          display: grid;
          gap: 6px;
        }
        .kv {
          display: grid;
          grid-template-columns: 70px 1fr;
          gap: 8px;
          align-items: start;
        }
        .k {
          font-size: 11px;
          color: #8b8177;
        }
        .v {
          font-size: 12px;
          color: #4d433a;
          word-break: break-word;
        }
        .card-note {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid #f0e1cf;
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
        @media (max-width: 640px) {
          .table-only {
            display: none;
          }
          .card-only {
            display: grid;
          }
          .status-select {
            max-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}