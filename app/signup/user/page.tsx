"use client";

import React, { useState, FormEvent } from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { getCurrentUserId } from "@/lib/auth";
import { createUserSignup } from "@/lib/repositories/signupRepository";

const HAS_UNREAD = false;

type FormState = {
  name: string;
  contact: string;
  hopes: string;
  howToUse: string;
};

export default function UserSignupPage() {
  const [form, setForm] = useState<FormState>({
    name: "",
    contact: "",
    hopes: "",
    howToUse: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ゲスト or 会員問わず、現時点のIDを取得（guest-xxxx or uuid）
  const currentUserId = getCurrentUserId();

  const handleChange =
    (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
    };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("お名前を入力してください。");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        ...form,
        currentUserId,
      };

      const result = await createUserSignup({
        name: form.name.trim(),
        contact: form.contact.trim() || null,
        payload,
      });

      if (!result) {
        setError("送信に失敗しました。時間をおいて再度お試しください。");
        setSubmitting(false);
        return;
      }

      setDone(true);
    } catch (err) {
      console.error("[UserSignupPage] submit error:", err);
      setError("送信に失敗しました。通信環境をご確認ください。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-shell">
      <AppHeader title="一般ユーザー登録申請" />
      <main className="app-main">
        <div className="form-root">
          {done ? (
            <div className="thankyou-card">
              <h2 className="thankyou-title">送信が完了しました</h2>
              <p className="thankyou-text">
                ご入力いただいた内容をもとに、LRoomの準備が整い次第ご連絡いたします。
                しばらくお待ちいただけたら嬉しいです。
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="form-card">
              <p className="form-lead">
                LRoomをどんなふうに使ってみたいか、ざっくりで大丈夫なので教えてください。
              </p>

              <div className="field">
                <label className="label">
                  お名前 <span className="required">必須</span>
                </label>
                <input
                  type="text"
                  className="input"
                  value={form.name}
                  onChange={handleChange("name")}
                  placeholder="表示名でも本名でも大丈夫です"
                  required
                />
              </div>

              <div className="field">
                <label className="label">連絡先（メール / LINE など）</label>
                <input
                  type="text"
                  className="input"
                  value={form.contact}
                  onChange={handleChange("contact")}
                  placeholder="任意。お返事が必要な場合に使います"
                />
              </div>

              <div className="field">
                <label className="label">どんなことができたら嬉しいか</label>
                <textarea
                  className="textarea"
                  value={form.hopes}
                  onChange={handleChange("hopes")}
                  placeholder="例）安心してDMで相談したい／気になるセラピストさんの投稿だけ見たい など"
                  rows={3}
                />
              </div>

              <div className="field">
                <label className="label">LRoomの使い方イメージ</label>
                <textarea
                  className="textarea"
                  value={form.howToUse}
                  onChange={handleChange("howToUse")}
                  placeholder="まだふわっとしたイメージのままで大丈夫です"
                  rows={3}
                />
              </div>

              {error && <p className="error-text">{error}</p>}

              <button
                type="submit"
                className="submit-btn"
                disabled={submitting}
              >
                {submitting ? "送信中..." : "この内容で送信する"}
              </button>

              <p className="note">
                ※ 入力内容は、LRoomの改善やご案内のためにのみ利用します。
              </p>
            </form>
          )}
        </div>
      </main>

      <BottomNav hasUnread={HAS_UNREAD} />

      <style jsx>{`
        .app-shell {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: #faf7f3;
        }

        .app-main {
          flex: 1;
          padding: 12px 12px 72px;
        }

        .form-root {
          max-width: 520px;
          margin: 0 auto;
        }

        .form-card {
          background: #ffffff;
          border-radius: 16px;
          padding: 16px 14px 18px;
          box-shadow: 0 8px 24px rgba(10, 10, 10, 0.02);
          border: 1px solid rgba(220, 210, 200, 0.7);
        }

        .form-lead {
          font-size: 12px;
          color: var(--text-sub, #666);
          line-height: 1.7;
          margin-bottom: 12px;
        }

        .field {
          margin-bottom: 12px;
        }

        .label {
          display: flex;
          align-items: center;
          font-size: 12px;
          font-weight: 500;
          margin-bottom: 4px;
        }

        .required {
          margin-left: 6px;
          font-size: 10px;
          color: #b94a48;
          padding: 2px 6px;
          border-radius: 999px;
          background: #fdecea;
        }

        .input,
        .textarea {
          width: 100%;
          border-radius: 12px;
          border: 1px solid var(--border, #ddd);
          padding: 8px 10px;
          font-size: 13px;
          background: #fff;
        }

        .textarea {
          resize: vertical;
          min-height: 72px;
        }

        .submit-btn {
          width: 100%;
          margin-top: 4px;
          border-radius: 999px;
          border: none;
          padding: 10px 0;
          font-size: 13px;
          font-weight: 500;
          color: #fff;
          background: linear-gradient(
            135deg,
            var(--accent, #d9b07c),
            var(--accent-deep, #b4895a)
          );
        }

        .submit-btn[disabled] {
          opacity: 0.7;
        }

        .error-text {
          font-size: 11px;
          color: #b94a48;
          margin: 4px 0 6px;
        }

        .note {
          margin-top: 8px;
          font-size: 11px;
          color: var(--text-sub, #777);
        }

        .thankyou-card {
          background: #ffffff;
          border-radius: 16px;
          padding: 20px 16px 18px;
          box-shadow: 0 8px 24px rgba(10, 10, 10, 0.02);
          border: 1px solid rgba(220, 210, 200, 0.7);
        }

        .thankyou-title {
          font-size: 15px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .thankyou-text {
          font-size: 13px;
          color: var(--text-sub, #555);
          line-height: 1.7;
        }
      `}</style>
    </div>
  );
}