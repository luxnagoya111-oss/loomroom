// app/contact/page.tsx

"use client";

import React, {
  useState,
  useEffect,
  FormEvent,
  ChangeEvent,
} from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { getCurrentUserId } from "@/lib/auth"; // ★ 追加

// ★ 将来ログインと連動させる。今は localStorage から取得（lib/auth）
const CURRENT_USER_ID = getCurrentUserId();
const HAS_UNREAD = false;

type ContactCategory = "feedback" | "bug" | "signup" | "other";

// ★ 区分を正式に5種類に
type UserType = "guest" | "member" | "therapist" | "store" | "other";

// ★ ゲスト用のブラウザごとの仮ID保存キー
const GUEST_ID_KEY = "loomroom_guest_id_v1";

export default function ContactPage() {
  // ★ だれが問い合わせたかを識別するためのID（画面からは変更不可）
  const [userId, setUserId] = useState<string>("");

  const [name, setName] = useState("");
  // ★ 初期値は「ゲスト（未登録）」
  const [userType, setUserType] = useState<UserType>("guest");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<ContactCategory>("feedback");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);

  // ★ ページ表示時にユーザーIDを決定
  useEffect(() => {
    if (typeof window === "undefined") return;

    let id = CURRENT_USER_ID;

    // 今はログイン無し前提なので、guest のときだけブラウザごとの仮IDを発行
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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    // ★ 将来APIに投げるときのイメージ
    const payload = {
      userId, // ← ここで「誰からの問い合わせか」特定できる
      name,
      userType,
      email,
      category,
      body,
    };

    console.log("CONTACT_FORM_DEBUG:", payload);

    // 今はテスト用なのでフロントのみ
    setSent(true);
  };

  return (
    <div className="app-shell">
      <AppHeader title="お問い合わせ" />

      <main className="app-main">
        <section className="page-section">
          <h1 className="page-title">お問い合わせ</h1>
          <p className="page-description">
            LRoomに関するご意見や不具合のご報告、
            導入のご相談などがあればこちらからお知らせください。
            現時点ではテスト運用中のため、返信にお時間をいただく場合があります。
          </p>

          <form className="form-card" onSubmit={handleSubmit}>
            {/* ★ ユーザーID（固定・表示のみ） */}
            <div className="field">
              <label className="field-label">ユーザーID</label>
              <div className="id-display">
                <span className="id-display-text">
                  {userId || "読み込み中…"}
                </span>
              </div>
            </div>

            <div className="field">
              <label className="field-label">お名前（ニックネーム可）</label>
              <input
                className="field-input"
                value={name}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setName(e.target.value)
                }
                placeholder="例）momo / TAKI など"
              />
            </div>

            <div className="field">
              <label className="field-label">区分</label>
              <div className="radio-row">
                {/* ゲスト（未登録） */}
                <label className="radio-item">
                  <input
                    type="radio"
                    value="guest"
                    checked={userType === "guest"}
                    onChange={() => setUserType("guest")}
                  />
                  <span>ゲスト（未登録）</span>
                </label>

                {/* 会員 */}
                <label className="radio-item">
                  <input
                    type="radio"
                    value="member"
                    checked={userType === "member"}
                    onChange={() => setUserType("member")}
                  />
                  <span>会員</span>
                </label>

                {/* セラピスト */}
                <label className="radio-item">
                  <input
                    type="radio"
                    value="therapist"
                    checked={userType === "therapist"}
                    onChange={() => setUserType("therapist")}
                  />
                  <span>セラピスト</span>
                </label>

                {/* 店 */}
                <label className="radio-item">
                  <input
                    type="radio"
                    value="store"
                    checked={userType === "store"}
                    onChange={() => setUserType("store")}
                  />
                  <span>店</span>
                </label>

                {/* その他 */}
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
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setEmail(e.target.value)
                }
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
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                  setBody(e.target.value)
                }
                placeholder="具体的な状況やご希望などをご記入ください。"
              />
            </div>

            {sent && (
              <p className="sent-message">
                ありがとうございます。送信内容はブラウザ内で一時的に保持されるだけで、
                まだ運営には自動送信されません。
                本格運用前のテスト段階のため、実際の送信処理は後から接続していきます。
              </p>
            )}

            <button type="submit" className="primary-button">
              この内容で送信（テスト）
            </button>
          </form>
        </section>
      </main>

      <BottomNav
        active="mypage" // 必要なら "home" とかに変更してOK
        hasUnread={HAS_UNREAD}
      />

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

        /* ユーザーID表示用（入力不可のラベル風） */
        .id-display {
          border-radius: 10px;
          border: 1px dashed var(--border);
          padding: 8px 10px;
          background: var(--surface-soft);
        }

        .id-display-text {
          font-family: monospace;
          font-size: 12px;
          color: var(--text-sub);
        }

        .sent-message {
          margin-top: 10px;
          font-size: 11px;
          line-height: 1.6;
          color: var(--text-sub);
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
        }
      `}</style>
    </div>
  );
}