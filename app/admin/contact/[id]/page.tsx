"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  ua: string | null;
  device_hint: string | null;
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

  const subtitle = useMemo(() => (id ? `Ticket：${id}` : undefined), [id]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/contact/${id}`, {
        headers: { "x-admin-key": ADMIN_KEY },
      });
      const json = await res.json().catch(() => null);
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
      const res = await fetch(`/api/admin/contact/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": ADMIN_KEY,
        },
        body: JSON.stringify({ status, priority }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErrorMsg(json?.error || `save failed (status=${res.status})`);
        return;
      }
      setTicket(json.data);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-root">
      <AppHeader title="管理：お問い合わせ詳細" subtitle={subtitle} />

      <main className="admin-main">
        <section className="surface-card admin-card">
          <div className="head">
            <button type="button" className="btn-outline" onClick={() => router.back()}>
              ← 戻る
            </button>
            <button type="button" className="btn-outline" onClick={load} disabled={loading}>
              再読み込み
            </button>
          </div>

          {errorMsg && <div className="error">{errorMsg}</div>}

          {loading ? (
            <div className="hint">読み込み中…</div>
          ) : !ticket ? (
            <div className="hint">データがありません。</div>
          ) : (
            <>
              <div className="meta">
                <div className="meta-row">
                  <div className="meta-k">受信日時</div>
                  <div className="meta-v">{timeLabel(ticket.created_at)}</div>
                </div>
                <div className="meta-row">
                  <div className="meta-k">種別</div>
                  <div className="meta-v">{ticket.category}</div>
                </div>
                <div className="meta-row">
                  <div className="meta-k">ユーザー</div>
                  <div className="meta-v mono">
                    {ticket.user_type} · {ticket.user_id}
                  </div>
                </div>
                <div className="meta-row">
                  <div className="meta-k">名前</div>
                  <div className="meta-v">{ticket.name}</div>
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
                  <div className="meta-v mono">
                    {ticket.device_hint || "（不明）"}
                  </div>
                </div>
              </div>

              <div className="body-card">
                <div className="body-title">内容</div>
                <div className="body-text">{ticket.body}</div>
              </div>

              <div className="controls">
                <div className="ctrl">
                  <label className="ctrl-label">ステータス</label>
                  <select
                    className="ctrl-input"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
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
                    onChange={(e) => setPriority(e.target.value as any)}
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

              {ticket.ua ? (
                <details className="ua">
                  <summary>User-Agent</summary>
                  <div className="mono ua-text">{ticket.ua}</div>
                </details>
              ) : null}
            </>
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
        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }
        .btn-outline {
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface-soft);
          color: var(--text-sub);
        }
        .btn-primary {
          font-size: 12px;
          padding: 10px 12px;
          border-radius: 999px;
          border: none;
          background: var(--accent);
          color: #fff;
          box-shadow: 0 6px 16px rgba(180, 137, 90, 0.35);
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

        .meta {
          border: 1px solid var(--border-soft, rgba(0, 0, 0, 0.06));
          border-radius: 14px;
          background: var(--surface-soft, rgba(255, 255, 255, 0.9));
          padding: 10px;
          margin: 10px 0;
        }
        .meta-row {
          display: flex;
          gap: 10px;
          padding: 6px 0;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        }
        .meta-row:last-child {
          border-bottom: none;
        }
        .meta-k {
          width: 86px;
          flex-shrink: 0;
          font-size: 11px;
          color: var(--text-sub);
        }
        .meta-v {
          font-size: 12px;
          color: var(--text-main);
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        }

        .body-card {
          border: 1px solid var(--border-soft, rgba(0, 0, 0, 0.06));
          border-radius: 14px;
          background: #fff;
          padding: 10px;
        }
        .body-title {
          font-size: 12px;
          font-weight: 700;
          margin-bottom: 6px;
        }
        .body-text {
          font-size: 12px;
          line-height: 1.8;
          color: var(--text-sub);
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .controls {
          margin-top: 12px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          align-items: end;
        }
        .ctrl {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ctrl-label {
          font-size: 11px;
          color: var(--text-sub);
        }
        .ctrl-input {
          border-radius: 10px;
          border: 1px solid var(--border);
          padding: 8px 10px;
          font-size: 13px;
          background: var(--surface-soft);
        }
        .controls .btn-primary {
          grid-column: 1 / -1;
        }

        .ua {
          margin-top: 10px;
          font-size: 12px;
          color: var(--text-sub);
        }
        .ua-text {
          margin-top: 6px;
          padding: 8px 10px;
          border-radius: 12px;
          border: 1px solid var(--border-soft, rgba(0, 0, 0, 0.06));
          background: var(--surface-soft, rgba(255, 255, 255, 0.9));
          overflow-wrap: anywhere;
        }
      `}</style>
    </div>
  );
}