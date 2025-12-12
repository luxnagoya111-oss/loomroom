// app/login/page.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/lib/supabaseClient";
import { persistCurrentUserId } from "@/lib/auth";

type Mode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const resetMessages = () => {
    setErrorMsg(null);
    setInfoMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!email || !password) {
      setErrorMsg("メールアドレスとパスワードを入力してください。");
      return;
    }
    if (mode === "signup" && !displayName.trim()) {
      setErrorMsg("表示名を入力してください。");
      return;
    }

    try {
      setLoading(true);

      if (mode === "login") {
        // ===== ログイン処理 =====
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          console.error("Supabase login error:", error);
          setErrorMsg(error.message || "ログインに失敗しました。");
          return;
        }

        const user = data.user;
        if (!user) {
          setErrorMsg("ユーザー情報を取得できませんでした。");
          return;
        }

        // localStorage に UUID を保存
        persistCurrentUserId(user.id);

        // 自分のマイページへ
        router.push(`/mypage/${user.id}`);
        return;
      }

      // ===== 新規登録処理 =====
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: displayName.trim(), // ← ★ここ
          }, 
        },
      });

      if (error) {
        console.error("Supabase signup error:", error);
        setErrorMsg(error.message || "新規登録に失敗しました。");
        return;
      }

      const user = data.user;
      if (!user) {
        // プロジェクトの設定によってはメール確認が必要な場合がある
        setInfoMsg(
          "仮登録が完了しました。メールが届いている場合は、案内に従って登録を完了してください。"
        );
        return;
      }

      // localStorage に UUID を保存
      persistCurrentUserId(user.id);

      // 自分のマイページへ
      router.push(`/mypage/${user.id}`);
    } catch (e: any) {
      console.error("login/signup unexpected error:", e);
      setErrorMsg(
        e?.message ||
          "処理中に予期せぬエラーが発生しました。時間をおいて再度お試しください。"
      );
    } finally {
      setLoading(false);
    }
  };

  const isLogin = mode === "login";

  return (
    <>
      <AppHeader
        title="ログイン / 新規登録"
        subtitle="LoomRoom アカウントへ"
        showBack={true}
      />

      <main className="login-main">
        <div className="login-container">
          {/* モード切り替えタブ */}
          <div className="login-tabs" role="tablist" aria-label="ログインモード">
            <button
              type="button"
              className={
                "login-tab" + (isLogin ? " login-tab--active" : "")
              }
              role="tab"
              aria-selected={isLogin}
              onClick={() => {
                setMode("login");
                resetMessages();
              }}
            >
              ログイン
            </button>
            <button
              type="button"
              className={
                "login-tab" + (!isLogin ? " login-tab--active" : "")
              }
              role="tab"
              aria-selected={!isLogin}
              onClick={() => {
                setMode("signup");
                resetMessages();
              }}
            >
              新規登録
            </button>
          </div>

          {/* フォームカード */}
          <section className="login-card">
            <form onSubmit={handleSubmit} className="login-form">
              {!isLogin && (
                <div className="form-row">
                  <label className="form-label">
                    表示名
                    <span className="form-label-sub">
                      LoomRoom 内で表示される名前です。
                    </span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="例）LoomRoom さん"
                    autoComplete="name"
                  />
                </div>
              )}

              <div className="form-row">
                <label className="form-label">
                  メールアドレス
                </label>
                <input
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="form-row">
                <label className="form-label">
                  パスワード
                </label>
                <input
                  type="password"
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8文字以上を推奨"
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  required
                />
              </div>

              {errorMsg && (
                <div className="login-message login-message--error">
                  {errorMsg}
                </div>
              )}
              {infoMsg && !errorMsg && (
                <div className="login-message login-message--info">
                  {infoMsg}
                </div>
              )}

              <button
                type="submit"
                className="login-submit-btn"
                disabled={loading}
              >
                {loading
                  ? isLogin
                    ? "ログイン中..."
                    : "登録処理中..."
                  : isLogin
                  ? "ログインする"
                  : "新規登録してはじめる"}
              </button>

              <p className="login-note">
                {isLogin
                  ? "まだアカウントをお持ちでない場合は「新規登録」タブから作成できます。"
                  : "すでにアカウントをお持ちの場合は「ログイン」タブからお進みください。"}
              </p>
            </form>
          </section>

          <section className="login-subsection">
            <h2 className="login-subsection-title">ログインについて</h2>
            <p className="login-subsection-text">
              一度ログインすると、この端末ではログアウトするまで同じアカウントで LoomRoom を利用できます。
            </p>
          </section>
        </div>
      </main>

      <style jsx>{`
        .login-main {
          padding: 12px 12px 80px;
          display: flex;
          justify-content: center;
        }

        .login-container {
          width: 100%;
          max-width: 480px;
        }

        .login-tabs {
          display: inline-flex;
          border-radius: 999px;
          border: 1px solid var(--border);
          padding: 2px;
          margin: 8px 0 12px;
          background: rgba(255, 255, 255, 0.8);
        }

        .login-tab {
          flex: 1;
          min-width: 120px;
          border: none;
          background: transparent;
          border-radius: 999px;
          padding: 6px 14px;
          font-size: 13px;
          cursor: pointer;
          color: var(--text-sub);
        }

        .login-tab--active {
          background: rgba(250, 236, 214, 0.95);
          color: #8b5c20;
          font-weight: 600;
        }

        .login-card {
          background: #ffffff;
          border-radius: 16px;
          padding: 16px 14px 14px;
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .form-row {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .form-label {
          font-size: 12px;
          font-weight: 500;
        }

        .form-label-sub {
          display: block;
          font-size: 10px;
          color: var(--text-sub);
          margin-top: 2px;
        }

        .form-input {
          border-radius: 999px;
          border: 1px solid var(--border);
          padding: 8px 12px;
          font-size: 13px;
          background: rgba(255, 255, 255, 0.9);
        }

        .form-input::placeholder {
          color: #c4c4c4;
        }

        .login-message {
          font-size: 12px;
          padding: 8px 10px;
          border-radius: 8px;
          line-height: 1.6;
        }

        .login-message--error {
          background: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fecaca;
        }

        .login-message--info {
          background: #eff6ff;
          color: #1d4ed8;
          border: 1px solid #bfdbfe;
        }

        .login-submit-btn {
          margin-top: 4px;
          width: 100%;
          border-radius: 999px;
          border: none;
          padding: 10px 12px;
          font-size: 14px;
          font-weight: 600;
          background: linear-gradient(
            135deg,
            #f3c98b,
            #e8b362
          ); /* シャンパンゴールド系 */
          color: #4a2b05;
          cursor: pointer;
          box-shadow: 0 8px 18px rgba(148, 98, 36, 0.25);
        }

        .login-submit-btn:disabled {
          opacity: 0.7;
          cursor: default;
          box-shadow: none;
        }

        .login-note {
          margin-top: 6px;
          font-size: 11px;
          color: var(--text-sub);
        }

        .login-subsection {
          margin-top: 16px;
          padding: 10px 2px;
        }

        .login-subsection-title {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .login-subsection-text {
          font-size: 12px;
          color: var(--text-sub);
          line-height: 1.6;
        }
      `}</style>
    </>
  );
}