// app/admin/contact/page.tsx
"use client";

import React, { useEffect, useMemo, useState, ChangeEvent } from "react";
import Link from "next/link";

type Ticket = {
  id: string;
  created_at: string;
  status: "new" | "triaging" | "waiting_user" | "resolved" | "closed";
  priority: "low" | "normal" | "high";
  category: "feedback" | "bug" | "signup" | "other";
  user_type: "guest" | "member" | "therapist" | "store" | "other";
  user_id: string;
  name: string;
  email: string | null;
  body: string;
  page_url: string | null;
};

const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY ?? "";

async function adminFetch(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);

  // GET には Content-Type 不要（CORS/プリフライトの癖を減らす）
  const method = (init?.method || "GET").toUpperCase();
  if (!headers.get("Content-Type") && method !== "GET") {
    headers.set("Content-Type", "application/json");
  }

  if (ADMIN_KEY) headers.set("x-admin-key", ADMIN_KEY);
  return fetch(input, { ...init, headers, cache: "no-store" });
}

function timeLabel(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ja-JP", { hour12: false });
  } catch {
    return iso;
  }
}

function shortId(id: string) {
  if (!id) return "";
  return id.replace(/-/g, "").slice(0, 8);
}

function clip(s: string, n = 60) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

export default function AdminContactListPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Ticket[]>([]);
  const [status, setStatus] = useState<string>(""); // filter
  const [q, setQ] = useState<string>(""); // search
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (status) sp.set("status", status);
    if (q.trim()) sp.set("q", q.trim());
    sp.set("limit", "80");
    return sp.toString();
  }, [status, q]);

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await adminFetch(`/api/admin/contact?${queryString}`, { method: "GET" });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok || !json?.ok) {
        setErrorMsg(json?.error || `load failed (status=${res.status})`);
        setItems([]);
        return;
      }
      setItems((json.data ?? []) as Ticket[]);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "load failed");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  return (
    <div className="page-root">
      <div className="page-head">
        <div>
          <h1 className="page-title">問い合わせ</h1>
          <p className="page-lead">contact_tickets の受信一覧です。クリックで詳細へ移動します。</p>
        </div>

        <button type="button" className="btn-outline" onClick={load} disabled={loading}>
          再読み込み
        </button>
      </div>

      <div className="toolbar">
        <div className="filter">
          <label className="filter-label">ステータス</label>
          <select className="filter-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">すべて</option>
            <option value="new">new</option>
            <option value="triaging">triaging</option>
            <option value="waiting_user">waiting_user</option>
            <option value="resolved">resolved</option>
            <option value="closed">closed</option>
          </select>
        </div>

        <div className="filter grow">
          <label className="filter-label">検索（user_id / name / email / body）</label>
          <input
            className="filter-input"
            value={q}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
            placeholder="例）guest- / bug / メール / 文面 など"
          />
        </div>

        <div className="count">{items.length} 件</div>
      </div>

      {errorMsg && <div className="status-message error">{errorMsg}</div>}

      {loading ? (
        <div className="status-message">読み込み中...</div>
      ) : items.length === 0 ? (
        <div className="status-message">該当する問い合わせがありません。</div>
      ) : (
        <div className="list">
          {items.map((t) => (
            <Link key={t.id} href={`/admin/contact/${t.id}`} className="row">
              <div className="row-top">
                <div className="row-left">
                  <span className={"pill status-" + t.status}>{t.status}</span>
                  <span className={"pill prio-" + t.priority}>{t.priority}</span>
                  <span className="pill cat">{t.category}</span>
                </div>
                <div className="row-time">{timeLabel(t.created_at)}</div>
              </div>

              <div className="row-mid">
                <div className="row-name">{t.name || "（名前なし）"}</div>
                <div className="row-sub">
                  <span className="mono">{t.user_type}</span>
                  <span className="dot">·</span>
                  <span className="mono">{shortId(t.user_id)}</span>
                  {t.email ? (
                    <>
                      <span className="dot">·</span>
                      <span className="mono">email</span>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="row-body">{clip(t.body, 90)}</div>
            </Link>
          ))}
        </div>
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

        .btn-outline {
          font-size: 12px;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid var(--border, rgba(220, 210, 200, 0.9));
          background: var(--surface-soft, #fff);
          color: var(--text-sub, #6b7280);
          white-space: nowrap;
        }

        .toolbar {
          display: flex;
          gap: 10px;
          align-items: flex-end;
          flex-wrap: wrap;
          margin: 10px 0 10px;
        }

        .filter {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 160px;
        }

        .filter.grow {
          flex: 1;
          min-width: 240px;
        }

        .filter-label {
          font-size: 11px;
          color: var(--text-sub, #6b7280);
        }

        .filter-input {
          border-radius: 10px;
          border: 1px solid var(--border, rgba(220, 210, 200, 0.9));
          padding: 8px 10px;
          font-size: 13px;
          background: var(--surface-soft, #fff);
          outline: none;
        }

        .filter-input:focus {
          border-color: rgba(215, 185, 118, 0.9);
          box-shadow: 0 0 0 2px rgba(215, 185, 118, 0.18);
        }

        .count {
          font-size: 12px;
          color: var(--text-sub, #777);
          white-space: nowrap;
          margin-left: auto;
          padding-bottom: 2px;
        }

        .status-message {
          font-size: 13px;
          color: var(--text-sub, #555);
          padding: 10px 2px;
        }

        .status-message.error {
          color: #b94a48;
        }

        .list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 8px;
        }

        .row {
          display: block;
          text-decoration: none;
          color: inherit;
          border: 1px solid var(--border-soft, rgba(0, 0, 0, 0.06));
          background: var(--surface-soft, rgba(255, 255, 255, 0.9));
          border-radius: 14px;
          padding: 10px;
          transition: transform 0.08s ease, border-color 0.08s ease, box-shadow 0.08s ease;
        }

        .row:hover {
          transform: translateY(-1px);
          border-color: rgba(215, 185, 118, 0.45);
          box-shadow: 0 10px 24px rgba(10, 10, 10, 0.04);
        }

        .row-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 6px;
        }

        .row-left {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .row-time {
          font-size: 11px;
          color: var(--text-sub, #6b7280);
          white-space: nowrap;
        }

        .pill {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: rgba(255, 255, 255, 0.7);
          white-space: nowrap;
        }

        .status-new {
          background: rgba(215, 185, 118, 0.22);
        }
        .status-triaging {
          background: rgba(147, 197, 253, 0.22);
        }
        .status-waiting_user {
          background: rgba(251, 191, 36, 0.18);
        }
        .status-resolved {
          background: rgba(74, 222, 128, 0.16);
        }
        .status-closed {
          background: rgba(148, 163, 184, 0.16);
        }

        .prio-high {
          border-color: rgba(239, 68, 68, 0.25);
          background: rgba(239, 68, 68, 0.08);
        }
        .prio-normal {
          background: rgba(148, 163, 184, 0.12);
        }
        .prio-low {
          background: rgba(203, 213, 225, 0.12);
        }

        .cat {
          background: rgba(255, 255, 255, 0.7);
        }

        .row-mid {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 4px;
        }

        .row-name {
          font-size: 13px;
          font-weight: 800;
          color: #2d2620;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 60%;
        }

        .row-sub {
          font-size: 11px;
          color: var(--text-sub, #6b7280);
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
            monospace;
        }

        .dot {
          opacity: 0.6;
        }

        .row-body {
          font-size: 12px;
          color: var(--text-sub, #6b7280);
          line-height: 1.6;
        }

        @media (max-width: 860px) {
          .list {
            grid-template-columns: 1fr;
          }
          .row-name {
            max-width: 58%;
          }
        }
      `}</style>
    </div>
  );
}