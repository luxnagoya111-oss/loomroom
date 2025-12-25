// app/admin/stores/page.tsx
"use client";

import React, { useEffect, useMemo, useState, ChangeEvent } from "react";
import type { DbSignupApplicationRow, DbSignupStatus } from "@/types/db";

type StoreSignup = DbSignupApplicationRow;

const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY ?? "";

async function adminFetch(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (!headers.get("Content-Type") && init?.method && init.method !== "GET") {
    headers.set("Content-Type", "application/json");
  }
  if (ADMIN_KEY) headers.set("x-admin-key", ADMIN_KEY);
  return fetch(input, { ...init, headers, cache: "no-store" });
}

async function apiGetStoreSignups(): Promise<StoreSignup[]> {
  const res = await adminFetch("/api/admin/store-signups?type=store", { method: "GET" });
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

async function apiUpdateSignupStatus(id: string, status: DbSignupStatus): Promise<StoreSignup> {
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
      <tr key={app.id} className="admin-tr">
        <td className="admin-td admin-col--main">
          <div className="admin-item-name">{app.name}</div>
          <div className="admin-meta-chips">
            {area && <span className="admin-pill">エリア: {area}</span>}
            {contactName && <span className="admin-pill">担当: {contactName}</span>}
            {website && <span className="admin-pill">Web: {website}</span>}
          </div>
        </td>

        <td className="admin-td admin-col--contact">
          {contact && <div className="admin-sub">{contact}</div>}
          <div className="admin-date">{created}</div>
        </td>

        <td className="admin-td admin-col--note">
          {note ? (
            <div className="admin-note-text">{note}</div>
          ) : (
            <div className="admin-sub admin-muted">—</div>
          )}
        </td>

        <td className="admin-td admin-col--status">
          <div className={`admin-signup-status admin-signup-status--${app.status}`}>
            {statusLabel(app.status)}
          </div>

          <select
            className="admin-status-select"
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

          {updatingId === app.id && <div className="admin-sub admin-muted">更新中…</div>}
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
      <div key={app.id} className="admin-signup-card">
        <div className="admin-signup-card-head">
          <div className="admin-signup-card-title">{app.name}</div>
          <div className={`admin-signup-status admin-signup-status--${app.status}`}>
            {statusLabel(app.status)}
          </div>
        </div>

        <div className="admin-signup-card-meta">
          {area && (
            <div className="admin-kv">
              <span className="admin-k">エリア</span>
              <span className="admin-v">{area}</span>
            </div>
          )}
          {contactName && (
            <div className="admin-kv">
              <span className="admin-k">担当</span>
              <span className="admin-v">{contactName}</span>
            </div>
          )}
          {website && (
            <div className="admin-kv">
              <span className="admin-k">Web</span>
              <span className="admin-v">{website}</span>
            </div>
          )}
          {contact && (
            <div className="admin-kv">
              <span className="admin-k">連絡先</span>
              <span className="admin-v">{contact}</span>
            </div>
          )}
          {created && (
            <div className="admin-kv">
              <span className="admin-k">申請日時</span>
              <span className="admin-v">{created}</span>
            </div>
          )}
        </div>

        {note && (
          <div className="admin-signup-card-note">
            <div className="admin-k">補足</div>
            <div className="admin-v">{note}</div>
          </div>
        )}

        <div className="admin-signup-card-actions">
          <select
            className="admin-status-select"
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

          {updatingId === app.id && <div className="admin-sub admin-muted">更新中…</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="admin-shell">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">店舗申請一覧</h1>
          <p className="admin-page-lead">
            /signup/creator から送信された店舗向け申請の一覧です。承認（approved）にすると「店舗の本登録」
            「users.role の更新」まで自動で行われます。
          </p>
        </div>
      </div>

      <div className="admin-toolbar">
        <input
          className="admin-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="店舗名 / 連絡先 / エリア / 補足 を検索"
        />
        <div className="admin-count">{filtered.length} 件</div>
      </div>

      {loading ? (
        <div className="admin-status-message">読み込み中...</div>
      ) : error ? (
        <div className="admin-status-message admin-status-message--error">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="admin-status-message">該当する申請はありません。</div>
      ) : (
        <>
          <div className="admin-table-only">
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="admin-th admin-col--main">店舗情報</th>
                    <th className="admin-th admin-col--contact">連絡先 / 申請日時</th>
                    <th className="admin-th admin-col--note">補足</th>
                    <th className="admin-th admin-col--status">ステータス</th>
                  </tr>
                </thead>
                <tbody>{filtered.map(renderRow)}</tbody>
              </table>
            </div>
          </div>

          <div className="admin-card-only">{filtered.map(renderCard)}</div>
        </>
      )}
    </div>
  );
}