"use client";

import React, { useEffect, useMemo, useState, ChangeEvent } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";

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

const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || "";
const HAS_UNREAD = false;

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
      const res = await fetch(`/api/admin/contact?${queryString}`, {
        headers: {
          "x-admin-key": ADMIN_KEY,
        },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErrorMsg(json?.error || `load failed (status=${res.status})`);
        setItems([]);
        return;
      }
      setItems(json.data || []);
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
    <div className="app-root">
      <AppHeader title="管理：お問い合わせ" subtitle="contact_tickets" />

      <main className="admin-main">
        <section className="surface-card admin-card">
          <div className="admin-head">
            <div className="admin-title">受信一覧</div>

            <button type="button" className="btn-outline" onClick={load} disabled={loading}>
              再読み込み
            </button>
          </div>

          <div className="filters">
            <div className="filter">
              <label className="filter-label">ステータス</label>
              <select
                className="filter-input"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
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
          </div>

          {errorMsg && <div className="error">{errorMsg}</div>}

          {loading ? (
            <div className="hint">読み込み中…</div>
          ) : items.length === 0 ? (
            <div className="hint">該当する問い合わせがありません。</div>
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

                  <div className="row-body">{clip(t.body, 72)}</div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      <BottomNav active="mypage" hasUnread={HAS_UNREAD} />

      <style jsx>{`
        .admin-main {
          padding: 12px 16px 90px;
          max-width: 480px;
          margin: 0 auto;
        }
        .admin-card {
          margin-top: 10px;
          padding: 12px;
        }
        .admin-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }
        .admin-title {
          font-size: 14px;
          font-weight: 700;
        }
        .btn-outline {
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface-soft);
          color: var(--text-sub);
        }

        .filters {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }
        .filter {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 140px;
        }
        .filter.grow {
          flex: 1;
          min-width: 200px;
        }
        .filter-label {
          font-size: 11px;
          color: var(--text-sub);
        }
        .filter-input {
          border-radius: 10px;
          border: 1px solid var(--border);
          padding: 8px 10px;
          font-size: 13px;
          background: var(--surface-soft);
        }

        .error {
          margin: 8px 0;
          font-size: 12px;
          color: #b91c1c;
        }
        .hint {
          font-size: 12px;
          color: var(--text-sub);
          padding: 10px 2px;
        }

        .list {
          display: flex;
          flex-direction: column;
          gap: 8px;
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
          color: var(--text-sub);
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
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .row-sub {
          font-size: 11px;
          color: var(--text-sub);
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        }
        .dot {
          opacity: 0.6;
        }
        .row-body {
          font-size: 12px;
          color: var(--text-sub);
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}