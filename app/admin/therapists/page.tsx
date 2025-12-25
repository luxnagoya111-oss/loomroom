// app/admin/therapists/page.tsx
"use client";

import React, { useEffect, useMemo, useState, ChangeEvent } from "react";
import {
  listSignupApplications,
  updateSignupStatus,
} from "@/lib/repositories/signupRepository";
import type { DbSignupApplicationRow, DbSignupStatus } from "@/types/db";

type TherapistSignup = DbSignupApplicationRow;

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

export default function AdminTherapistsPage() {
  const [items, setItems] = useState<TherapistSignup[]>([]);
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
        const rows = await listSignupApplications({ type: "therapist" });
        if (cancelled) return;
        setItems(rows);
      } catch (err) {
        console.error("[AdminTherapistsPage] load error:", err);
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
      const area = String(payload.area ?? "");
      const experience = String(payload.experience ?? "");
      const wishStore = String(payload.wishStore ?? "");
      const note = String(payload.note ?? "");

      return [name, contact, area, experience, wishStore, note]
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
      console.error("[AdminTherapistsPage] update error:", err);
      setError("ステータス更新に失敗しました。");
    } finally {
      setUpdatingId(null);
    }
  };

  const renderRow = (app: TherapistSignup) => {
    const payload = (app.payload ?? {}) as any;

    const area: string = payload.area ?? "";
    const experience: string = payload.experience ?? "";
    const wishStore: string = payload.wishStore ?? "";
    const note: string = payload.note ?? "";
    const contact: string = app.contact ?? payload.contact ?? "";

    const created = formatCreatedAt(app.created_at);

    return (
      <tr key={app.id} className="admin-tr">
        <td className="admin-td admin-col--main">
          <div className="admin-item-name">{app.name}</div>

          <div className="admin-meta-chips">
            {area && <span className="admin-pill">エリア: {area}</span>}
            {wishStore && <span className="admin-pill">希望店舗: {wishStore}</span>}
            {experience && <span className="admin-pill">経験/背景: {experience}</span>}
          </div>
        </td>

        <td className="admin-td admin-col--contact">
          {contact ? <div className="admin-sub">{contact}</div> : <div className="admin-sub admin-muted">—</div>}
          <div className="admin-date">{created}</div>
        </td>

        <td className="admin-td admin-col--note">
          {note ? <div className="admin-note-text">{note}</div> : <div className="admin-sub admin-muted">—</div>}
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

  const renderCard = (app: TherapistSignup) => {
    const payload = (app.payload ?? {}) as any;

    const area: string = payload.area ?? "";
    const experience: string = payload.experience ?? "";
    const wishStore: string = payload.wishStore ?? "";
    const note: string = payload.note ?? "";
    const contact: string = app.contact ?? payload.contact ?? "";

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
          {wishStore && (
            <div className="admin-kv">
              <span className="admin-k">希望店舗</span>
              <span className="admin-v">{wishStore}</span>
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

        {experience && (
          <div className="admin-signup-card-note">
            <div className="admin-k">経験/背景</div>
            <div className="admin-v">{experience}</div>
          </div>
        )}

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
          <h1 className="admin-page-title">セラピスト申請</h1>
          <p className="admin-page-lead">
            /signup/creator から送信されたセラピスト申請（signup_applications）を表示します。
            ステータスを approved / rejected に変更すると審査結果が確定した扱いになります。
          </p>
        </div>
      </div>

      <div className="admin-toolbar">
        <input
          className="admin-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="名前 / 連絡先 / エリア / 希望店舗 / 経験 / 補足 を検索"
        />
        <div className="admin-count">{filtered.length} 件</div>
      </div>

      {loading ? (
        <div className="admin-status-message">読み込み中...</div>
      ) : error ? (
        <div className="admin-status-message admin-status-message--error">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="admin-status-message">まだ申請はありません。</div>
      ) : (
        <>
          <div className="admin-table-only">
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="admin-th admin-col--main">セラピスト情報</th>
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