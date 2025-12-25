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
    <div className="admin-shell">
      {/* ===== Header ===== */}
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">問い合わせ詳細</h1>
          <p className="admin-page-lead">
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
          <button
            type="button"
            className="admin-btn-outline"
            onClick={() => router.back()}
          >
            ← 戻る
          </button>
          <button
            type="button"
            className="admin-btn-outline"
            onClick={load}
            disabled={loading}
          >
            再読み込み
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="status-message error">{errorMsg}</div>
      )}

      {loading ? (
        <div className="status-message">読み込み中...</div>
      ) : !ticket ? (
        <div className="status-message">データがありません。</div>
      ) : (
        <div className="admin-grid">
          {/* ===== Meta ===== */}
          <section className="admin-card">
            <div className="admin-card-title-row">
              <div className="admin-card-title">メタ情報</div>
              <div className="admin-right-muted">
                {timeLabel(ticket.created_at)}
              </div>
            </div>

            <div className="admin-meta">
              <div className="admin-meta-row">
                <div className="admin-meta-key">ステータス</div>
                <div className="admin-meta-val">
                  <span
                    className={`admin-pill admin-pill--status-${ticket.status}`}
                  >
                    {ticket.status}
                  </span>
                </div>
              </div>

              <div className="admin-meta-row">
                <div className="admin-meta-key">優先度</div>
                <div className="admin-meta-val">
                  <span
                    className={`admin-pill admin-pill--prio-${ticket.priority}`}
                  >
                    {ticket.priority}
                  </span>
                </div>
              </div>

              <div className="admin-meta-row">
                <div className="admin-meta-key">種別</div>
                <div className="admin-meta-val">
                  <span className="admin-pill">{ticket.category}</span>
                </div>
              </div>

              <div className="admin-meta-row">
                <div className="admin-meta-key">ユーザー</div>
                <div className="admin-meta-val mono">
                  {ticket.user_type} · {shortId(ticket.user_id)}
                </div>
              </div>

              <div className="admin-meta-row">
                <div className="admin-meta-key">名前</div>
                <div className="admin-meta-val">
                  {ticket.name || "（名前なし）"}
                </div>
              </div>

              <div className="admin-meta-row">
                <div className="admin-meta-key">メール</div>
                <div className="admin-meta-val mono">
                  {ticket.email || "（なし）"}
                </div>
              </div>

              <div className="admin-meta-row">
                <div className="admin-meta-key">送信元URL</div>
                <div className="admin-meta-val mono">
                  {ticket.page_url || "（なし）"}
                </div>
              </div>

              <div className="admin-meta-row">
                <div className="admin-meta-key">端末</div>
                <div className="admin-meta-val mono">
                  {ticket.device_hint || "（不明）"}
                </div>
              </div>
            </div>

            {ticket.ua ? (
              <details className="ua">
                <summary>User-Agent</summary>
                <div className="mono ua-text">{ticket.ua}</div>
              </details>
            ) : null}
          </section>

          {/* ===== Body / Controls ===== */}
          <section className="admin-card">
            <div className="admin-card-title-row">
              <div className="admin-card-title">内容</div>
              <div className="admin-right-muted">/contact</div>
            </div>

            <div className="body-text">{ticket.body}</div>

            <div className="divider" />

            <div className="controls">
              <div className="admin-ctrl">
                <label className="admin-ctrl-label">ステータス</label>
                <select
                  className="admin-ctrl-input"
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as Ticket["status"])
                  }
                >
                  <option value="new">new</option>
                  <option value="triaging">triaging</option>
                  <option value="waiting_user">waiting_user</option>
                  <option value="resolved">resolved</option>
                  <option value="closed">closed</option>
                </select>
              </div>

              <div className="admin-ctrl">
                <label className="admin-ctrl-label">優先度</label>
                <select
                  className="admin-ctrl-input"
                  value={priority}
                  onChange={(e) =>
                    setPriority(e.target.value as Ticket["priority"])
                  }
                >
                  <option value="low">low</option>
                  <option value="normal">normal</option>
                  <option value="high">high</option>
                </select>
              </div>

              <button
                type="button"
                className="admin-btn-outline"
                onClick={save}
                disabled={saving}
              >
                {saving ? "保存中…" : "更新する"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}