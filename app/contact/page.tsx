"use client";

import React, { useState, useEffect, FormEvent, ChangeEvent } from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { getCurrentUserId } from "@/lib/auth";

// 将来ログインと連動させる。今は localStorage から取得（lib/auth）
const CURRENT_USER_ID = getCurrentUserId();
const HAS_UNREAD = false;

type ContactCategory = "feedback" | "bug" | "signup" | "other";

// 区分
type UserType = "guest" | "member" | "therapist" | "store" | "other";

// ゲスト用のブラウザごとの仮ID保存キー
const GUEST_ID_KEY = "loomroom_guest_id_v1";

export default function ContactPage() {
  // だれが問い合わせたかを識別するためのID（画面からは変更不可）
  const [userId, setUserId] = useState<string>("");

  const [name, setName] = useState("");
  const [userType, setUserType] = useState<UserType>("guest");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<ContactCategory>("feedback");
  const [body, setBody] = useState("");

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ページ表示時にユーザーIDを決定
  useEffect(() => {
    if (typeof window === "undefined") return;

    let id = CURRENT_USER_ID;

    // guest のときだけブラウザごとの仮IDを発行
    if (id === "guest") {
      const saved = window.localStorage.getItem(GUEST_ID_KEY);
      if (saved) {
        id = saved;
      } else {
        const newId = "guest-" + Math.random().toString(36).slice(2, 10);
        window.localStorage.setItem(GUEST_ID_KEY, newId);
        id = newId;
      }
    }

    setUserId(id);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSent(false);
    setTicketId(null);

    const trimmedName = name.trim();
    const trimmedBody = body.trim();

    if (!trimmedName) {
      setErrorMsg("お名前（ニックネーム可）を入力してください。");
      return;
    }
    if (!trimmedBody) {
      setErrorMsg("内容を入力してください。");
      return;
    }
    if (!userId) {
      setErrorMsg("ユーザーIDの取得に失敗しました。ページを再読み込みしてください。");
      return;
    }

    setSending(true);
    try {
      const payload = {
        userId,
        name: trimmedName,
        userType,
        email: email.trim(),
        category,
        body: trimmedBody,
        pageUrl: typeof window !== "undefined" ? window.location.href : "",
        ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
      };

      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        const msg = json?.error || `送信に失敗しました（status=${res.status}）`;
        setErrorMsg(msg);
        return;
      }

      setSent(true);
      setTicketId(json.ticketId || null);

      // 送信後は入力を残す/消すは好み。ここでは残しておく（ユーザーが控えを持てる）
      // setBody("");
      // setEmail("");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "送信に失敗しました。");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="app-shell">
      <AppHeader title="お問い合わせ" />

      <main className="app-main">
        <section className="page-section">
          <h1 className="page-title">お問い合わせ</h1>
          <p className="page-description">
            LRoomに関するご意見や不具合のご報告、導入のご相談などがあればこちらからお知らせください。
            返信が必要な場合のみ、メールアドレスをご入力ください。
          </p>

          <form className="form-card" onSubmit={handleSubmit}>
            <div className="field">
              <label className="field-label">ユーザーID</label>
              <div className="id-display">
                <span className="id-display-text">{userId || "読み込み中…"}</span>
              </div>
            </div>

            <div className="field">
              <label className="field-label">お名前（ニックネーム可）</label>
              <input
                className="field-input"
                value={name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                placeholder="例）momo / TAKI など"
              />
            </div>

            <div className="field">
              <label className="field-label">区分</label>
              <div className="radio-row">
                <label className="radio-item">
                  <input
                    type="radio"
                    value="guest"
                    checked={userType === "guest"}
                    onChange={() => setUserType("guest")}
                  />
                  <span>ゲスト（未登録）</span>
                </label>

                <label className="radio-item">
                  <input
                    type="radio"
                    value="member"
                    checked={userType === "member"}
                    onChange={() => setUserType("member")}
                  />
                  <span>会員</span>
                </label>

                <label className="radio-item">
                  <input
                    type="radio"
                    value="therapist"
                    checked={userType === "therapist"}
                    onChange={() => setUserType("therapist")}
                  />
                  <span>セラピスト</span>
                </label>

                <label className="radio-item">
                  <input
                    type="radio"
                    value="store"
                    checked={userType === "store"}
                    onChange={() => setUserType("store")}
                  />
                  <span>店</span>
                </label>

                <label className="radio-item">
                  <input
                    type="radio"
                    value="other"
                    checked={userType === "other"}
                    onChange={() => setUserType("other")}
                  />
                  <span>その他</span>
                </label>
              </div>
            </div>

            <div className="field">
              <label className="field-label">メールアドレス（任意）</label>
              <input
                className="field-input"
                type="email"
                value={email}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                placeholder="返信が必要な場合のみご入力ください"
              />
            </div>

            <div className="field">
              <label className="field-label">お問い合わせ種別</label>
              <select
                className="field-input"
                value={category}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  setCategory(e.target.value as ContactCategory)
                }
              >
                <option value="feedback">アプリへのご意見・ご要望</option>
                <option value="bug">不具合のご報告</option>
                <option value="signup">導入・登録のご相談</option>
                <option value="other">その他</option>
              </select>
            </div>

            <div className="field">
              <label className="field-label">内容</label>
              <textarea
                className="field-input field-textarea"
                rows={6}
                value={body}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
                placeholder="具体的な状況やご希望などをご記入ください。"
              />
            </div>

            {errorMsg && <p className="error-message">{errorMsg}</p>}

            {sent && (
              <p className="sent-message">
                送信を受け付けました。
                {ticketId ? (
                  <>
                    <br />
                    受付番号：<span className="ticket-id">{ticketId}</span>
                  </>
                ) : null}
              </p>
            )}

            <button type="submit" className="primary-button" disabled={sending || !userId}>
              {sending ? "送信中..." : "この内容で送信"}
            </button>
          </form>
        </section>
      </main>

      <BottomNav active="mypage" hasUnread={HAS_UNREAD} />

      <style jsx>{`
        .app-shell {
          min-height: 100vh;
          max-width: 480px;
          margin: 0 auto;
          background: var(--bg);
          color: var(--text-main);
          display: flex;
          flex-direction: column;
        }

        .app-main {
          flex: 1;
          padding: 16px 16px 88px;
        }

        .page-section {
          padding-top: 4px;
        }

        .page-title {
          font-size: 18px;
          font-weight: 600;
          letter-spacing: 0.02em;
          margin-bottom: 4px;
        }

        .page-description {
          font-size: 12px;
          line-height: 1.7;
          color: var(--text-sub);
          margin-bottom: 16px;
        }

        .form-card {
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--surface);
          padding: 14px 14px 18px;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 10px;
        }

        .field-label {
          font-size: 11px;
          color: var(--text-sub);
        }

        .field-input {
          border-radius: 10px;
          border: 1px solid var(--border);
          padding: 8px 10px;
          font-size: 13px;
          background: var(--surface-soft);
          outline: none;
        }

        .field-input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 1px rgba(215, 185, 118, 0.3);
        }

        .field-textarea {
          resize: vertical;
          min-height: 96px;
        }

        .radio-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .radio-item {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: var(--text-sub);
        }

        .id-display {
          border-radius: 10px;
          border: 1px dashed var(--border);
          padding: 8px 10px;
          background: var(--surface-soft);
        }

        .id-display-text {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: 12px;
          color: var(--text-sub);
        }

        .error-message {
          margin-top: 10px;
          font-size: 12px;
          line-height: 1.6;
          color: #b91c1c;
        }

        .sent-message {
          margin-top: 10px;
          font-size: 12px;
          line-height: 1.6;
          color: var(--text-sub);
        }

        .ticket-id {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: 12px;
          color: var(--text-main);
        }

        .primary-button {
          margin-top: 16px;
          width: 100%;
          border-radius: 999px;
          border: none;
          padding: 10px 0;
          font-size: 13px;
          font-weight: 500;
          background: var(--accent);
          color: #fff;
          box-shadow: 0 6px 16px rgba(180, 137, 90, 0.35);
          opacity: ${sending ? 0.8 : 1};
        }

        .primary-button[disabled] {
          opacity: 0.6;
        }
      `}</style>
    </div>
  );
}