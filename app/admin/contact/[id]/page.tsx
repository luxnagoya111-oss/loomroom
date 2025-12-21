// app/admin/contact/[id]/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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
  ua: string | null;
  device_hint: string | null;
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
  if (!id) return "";
  return id.replace(/-/g, "").slice(0, 10);
}

export default function AdminContactDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = (params?.id as string) || "";

  const [loading, setLoading] = useState(true);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Ticket["status"]>("new");
  const [priority, setPriority] = useState<Ticket["priority"]>("normal");

  const subtitle = useMemo(() => (id ? `Ticket: ${id}` : ""), [id]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await adminFetch(`/api/admin/contact/${id}`, { method: "GET" });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok || !json?.ok) {
        setErrorMsg(json?.error || `load failed (status=${res.status})`);
        setTicket(null);
        return;
      }
      const t: Ticket = json.data;
      setTicket(t);
      setStatus(t.status);
      setPriority(t.priority);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "load failed");
      setTicket(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const save = async () => {
    if (!id) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await adminFetch(`/api/admin/contact/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, priority }),
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok || !json?.ok) {
        setErrorMsg(json?.error || `save failed (status=${res.status})`);
        return;
      }
      const t: Ticket = json.data;
      setTicket(t);
      setStatus(t.status);
      setPriority(t.priority);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-root">
      <div className="page-head">
        <div>
          <h1 className="page-title">問い合わせ詳細</h1>
          <p className="page-lead">
            {subtitle ? (
              <>
                ID: <span className="mono">{subtitle.replace("Ticket: ", "")}</span>
              </>
            ) : (
              "Ticket詳細"
            )}
          </p>
        </div>

        <div className="head-actions">
          <button type="button" className="btn-outline" onClick={() => router.back()}>
            ← 戻る
          </button>
          <button type="button" className="btn-outline" onClick={load} disabled={loading}>
            再読み込み
          </button>
        </div>
      </div>

      {errorMsg && <div className="status-message error">{errorMsg}</div>}

      {loading ? (
        <div className="status-message">読み込み中...</div>
      ) : !ticket ? (
        <div className="status-message">データがありません。</div>
      ) : (
        <div className="grid">
          <section className="card">
            <div className="card-title-row">
              <div className="card-title">メタ情報</div>
              <div className="right-muted">{timeLabel(ticket.created_at)}</div>
            </div>

            <div className="meta">
              <div className="meta-row">
                <div className="meta-k">ステータス</div>
                <div className="meta-v">
                  <span className={"pill status-" + ticket.status}>{ticket.status}</span>
                </div>
              </div>

              <div className="meta-row">
                <div className="meta-k">優先度</div>
                <div className="meta-v">
                  <span className={"pill prio-" + ticket.priority}>{ticket.priority}</span>
                </div>
              </div>

              <div className="meta-row">
                <div className="meta-k">種別</div>
                <div className="meta-v">
                  <span className="pill cat">{ticket.category}</span>
                </div>
              </div>

              <div className="meta-row">
                <div className="meta-k">ユーザー</div>
                <div className="meta-v mono">
                  {ticket.user_type} · {shortId(ticket.user_id)}
                </div>
              </div>

              <div className="meta-row">
                <div className="meta-k">名前</div>
                <div className="meta-v">{ticket.name || "（名前なし）"}</div>
              </div>

              <div className="meta-row">
                <div className="meta-k">メール</div>
                <div className="meta-v mono">{ticket.email || "（なし）"}</div>
              </div>

              <div className="meta-row">
                <div className="meta-k">送信元URL</div>
                <div className="meta-v mono">{ticket.page_url || "（なし）"}</div>
              </div>

              <div className="meta-row">
                <div className="meta-k">端末</div>
                <div className="meta-v mono">{ticket.device_hint || "（不明）"}</div>
              </div>
            </div>

            {ticket.ua ? (
              <details className="ua">
                <summary>User-Agent</summary>
                <div className="mono ua-text">{ticket.ua}</div>
              </details>
            ) : null}
          </section>

          <section className="card">
            <div className="card-title-row">
              <div className="card-title">内容</div>
              <div className="right-muted">/contact</div>
            </div>

            <div className="body-text">{ticket.body}</div>

            <div className="divider" />

            <div className="controls">
              <div className="ctrl">
                <label className="ctrl-label">ステータス</label>
                <select
                  className="ctrl-input"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Ticket["status"])}
                >
                  <option value="new">new</option>
                  <option value="triaging">triaging</option>
                  <option value="waiting_user">waiting_user</option>
                  <option value="resolved">resolved</option>
                  <option value="closed">closed</option>
                </select>
              </div>

              <div className="ctrl">
                <label className="ctrl-label">優先度</label>
                <select
                  className="ctrl-input"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Ticket["priority"])}
                >
                  <option value="low">low</option>
                  <option value="normal">normal</option>
                  <option value="high">high</option>
                </select>
              </div>

              <button type="button" className="btn-primary" onClick={save} disabled={saving}>
                {saving ? "保存中…" : "更新する"}
              </button>
            </div>
          </section>
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

        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
            monospace;
        }

        .head-actions {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }

        .btn-outline {
          font-size: 12px;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid var(--border, rgba(220, 210, 200, 0.9));
          background: var(--surface-soft, rgba(255, 255, 255, 0.92));
          color: var(--text-sub, #6b7280);
          white-space: nowrap;
        }

        .btn-outline:disabled {
          opacity: 0.7;
        }

        .status-message {
          font-size: 13px;
          color: var(--text-sub, #6b7280);
          padding: 10px 2px;
        }

        .status-message.error {
          color: #b94a48;
        }

        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 8px;
          align-items: start;
        }

        .card {
          background: var(--surface-soft, rgba(255, 255, 255, 0.92));
          border: 1px solid rgba(220, 210, 200, 0.9);
          border-radius: 14px;
          padding: 12px;
          box-shadow: 0 8px 24px rgba(10, 10, 10, 0.02);
          min-width: 0;
        }

        .card-title-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 8px;
        }

        .card-title {
          font-size: 14px;
          font-weight: 800;
          color: var(--text-main, #111827);
        }

        .right-muted {
          font-size: 11px;
          color: var(--text-sub, #6b7280);
          white-space: nowrap;
        }

        .meta {
          display: grid;
          gap: 6px;
        }

        .meta-row {
          display: grid;
          grid-template-columns: 86px 1fr;
          gap: 10px;
          align-items: start;
          padding: 6px 0;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        }

        .meta-row:last-child {
          border-bottom: none;
        }

        .meta-k {
          font-size: 11px;
          color: var(--text-sub, #6b7280);
        }

        .meta-v {
          font-size: 12px;
          color: var(--text-main, #111827);
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid var(--border-light, rgba(0, 0, 0, 0.06));
          background: rgba(255, 255, 255, 0.7);
          white-space: nowrap;
        }

        .status-new {
          background: rgba(215, 185, 118, 0.22);
          border-color: rgba(215, 185, 118, 0.45);
        }
        .status-triaging {
          background: rgba(147, 197, 253, 0.18);
          border-color: rgba(147, 197, 253, 0.35);
        }
        .status-waiting_user {
          background: rgba(251, 191, 36, 0.16);
          border-color: rgba(251, 191, 36, 0.32);
        }
        .status-resolved {
          background: rgba(74, 222, 128, 0.14);
          border-color: rgba(74, 222, 128, 0.28);
        }
        .status-closed {
          background: rgba(148, 163, 184, 0.14);
          border-color: rgba(148, 163, 184, 0.28);
        }

        .prio-high {
          border-color: rgba(239, 68, 68, 0.22);
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

        .body-text {
          font-size: 12px;
          line-height: 1.8;
          color: var(--text-sub, #6b7280);
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          padding: 2px 0 4px;
        }

        .divider {
          height: 1px;
          background: rgba(0, 0, 0, 0.06);
          margin: 10px 0;
        }

        .controls {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          align-items: end;
        }

        .ctrl {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
        }

        .ctrl-label {
          font-size: 11px;
          color: var(--text-sub, #6b7280);
        }

        .ctrl-input {
          border-radius: 10px;
          border: 1px solid var(--border, rgba(220, 210, 200, 0.9));
          padding: 8px 10px;
          font-size: 13px;
          background: var(--surface-soft, rgba(255, 255, 255, 0.92));
          outline: none;
        }

        .ctrl-input:focus {
          border-color: rgba(215, 185, 118, 0.9);
          box-shadow: 0 0 0 2px rgba(215, 185, 118, 0.18);
          background: #fff;
        }

        .btn-primary {
          grid-column: 1 / -1;
          font-size: 12px;
          padding: 10px 12px;
          border-radius: 999px;
          border: none;
          background: linear-gradient(135deg, #f3c98b, #e8b362);
          color: #4a2b05;
          font-weight: 800;
          cursor: pointer;
        }

        .btn-primary:disabled {
          opacity: 0.7;
          cursor: default;
        }

        .ua {
          margin-top: 10px;
          font-size: 12px;
          color: var(--text-sub, #6b7280);
        }

        .ua summary {
          cursor: pointer;
          user-select: none;
        }

        .ua-text {
          margin-top: 6px;
          padding: 8px 10px;
          border-radius: 12px;
          border: 1px solid rgba(220, 210, 200, 0.9);
          background: rgba(255, 255, 255, 0.7);
          overflow-wrap: anywhere;
        }

        @media (max-width: 860px) {
          .grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}