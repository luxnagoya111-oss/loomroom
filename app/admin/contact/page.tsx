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
  return id ? id.replace(/-/g, "").slice(0, 8) : "";
}

function clip(s: string, n = 60) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

export default function AdminContactListPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Ticket[]>([]);
  const [status, setStatus] = useState<string>("");
  const [q, setQ] = useState<string>("");
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
      const res = await adminFetch(`/api/admin/contact?${queryString}`);
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok || !json?.ok) {
        setErrorMsg(json?.error || `load failed (${res.status})`);
        setItems([]);
        return;
      }
      setItems(json.data ?? []);
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
    <div className="admin-shell">
      {/* ===== Header ===== */}
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">問い合わせ</h1>
          <p className="admin-page-lead">
            contact_tickets の受信一覧です。クリックで詳細へ移動します。
          </p>
        </div>

        <button
          type="button"
          className="admin-btn-outline"
          onClick={load}
          disabled={loading}
        >
          再読み込み
        </button>
      </div>

      {/* ===== Toolbar ===== */}
      <div className="admin-grid" style={{ gridTemplateColumns: "1fr" }}>
        <div className="admin-card">
          <div className="controls">
            <div className="admin-ctrl">
              <label className="admin-ctrl-label">ステータス</label>
              <select
                className="admin-ctrl-input"
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

            <div className="admin-ctrl" style={{ gridColumn: "span 2" }}>
              <label className="admin-ctrl-label">
                検索（user_id / name / email / body）
              </label>
              <input
                className="admin-ctrl-input"
                value={q}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setQ(e.target.value)
                }
                placeholder="例）guest- / bug / メール / 文面 など"
              />
            </div>

            <div className="admin-right-muted">
              {items.length} 件
            </div>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="status-message error">{errorMsg}</div>
      )}

      {loading ? (
        <div className="status-message">読み込み中...</div>
      ) : items.length === 0 ? (
        <div className="status-message">
          該当する問い合わせがありません。
        </div>
      ) : (
        <div className="admin-grid">
          {items.map((t) => (
            <Link
              key={t.id}
              href={`/admin/contact/${t.id}`}
              className="admin-card"
            >
              <div className="admin-card-title-row">
                <div>
                  <span
                    className={`admin-pill admin-pill--status-${t.status}`}
                  >
                    {t.status}
                  </span>{" "}
                  <span
                    className={`admin-pill admin-pill--prio-${t.priority}`}
                  >
                    {t.priority}
                  </span>{" "}
                  <span className="admin-pill">{t.category}</span>
                </div>
                <div className="admin-right-muted">
                  {timeLabel(t.created_at)}
                </div>
              </div>

              <div className="admin-meta">
                <div className="admin-meta-row">
                  <div className="admin-meta-key">名前</div>
                  <div className="admin-meta-val">
                    {t.name || "（名前なし）"}
                  </div>
                </div>

                <div className="admin-meta-row">
                  <div className="admin-meta-key">ユーザー</div>
                  <div className="admin-meta-val mono">
                    {t.user_type} · {shortId(t.user_id)}
                    {t.email ? " · email" : ""}
                  </div>
                </div>
              </div>

              <div className="admin-right-muted" style={{ marginTop: 6 }}>
                {clip(t.body, 90)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}