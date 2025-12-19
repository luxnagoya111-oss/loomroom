// app/login/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/lib/supabaseClient";
import {
  persistCurrentUserId,
  resetAuthFlow,
  resendSignupConfirmation,
  isEmailNotConfirmedError,
} from "@/lib/auth";
import { getAuthRedirectTo } from "@/lib/authRedirect";

type Mode = "login" | "signup";

function hasOAuthParamsInUrl(): boolean {
  if (typeof window === "undefined") return false;
  const sp = new URLSearchParams(window.location.search);
  return (
    sp.has("code") ||
    sp.has("error") ||
    sp.has("error_description") ||
    sp.has("state")
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const [showResend, setShowResend] = useState(false);
  const [resending, setResending] = useState(false);

  const resetMessages = () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setShowResend(false);
  };

  /**
   * 画面を開いた時点でセッションがあるなら、そのまま /mypage へ
   *
   * OAuth の戻り口（code/error 付きURL）でこれが走ると不安定化しやすいので
   * その場合は自動遷移をスキップする。
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (hasOAuthParamsInUrl()) return;

        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error) return;

        const uid = data.session?.user?.id ?? null;
        if (uid) {
          persistCurrentUserId(uid);
          router.replace(`/mypage/${uid}`);
        }
      } catch {
        // noop
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  /**
   * Google（OAuth）
   * - “新規登録”/“ログイン”の区別はない（初回なら自動でUserが作られる）
   * - 開始前に resetAuthFlow() で壊れたPKCE状態を掃除
   */
  const handleGoogle = async () => {
    if (loading || resending) return;

    resetMessages();

    try {
      setLoading(true);

      // ★重要：壊れたOAuth/PKCE状態を掃除してから開始（必ず await）
      await resetAuthFlow();

      // ★運用方針：OAuth交換処理は /auth/callback のみ
      const redirectTo =
        typeof window === "undefined"
          ? getAuthRedirectTo("/auth/callback")
          : new URL("/auth/callback", window.location.origin).toString();

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          // テスト/運用安定のため、毎回アカウント選択を出す
          queryParams: {
            prompt: "select_account",
          },
        },
      });

      if (error) {
        console.error("[login.google] error:", error);
        setErrorMsg(error.message || "Googleログインを開始できませんでした。");
      }
      // 成功時はGoogle画面へ遷移するのでここでは何もしない
    } catch (e: any) {
      console.error("[login.google] unexpected:", e);
      setErrorMsg(
        e?.message ||
          "Googleログインの開始中にエラーが発生しました。時間をおいて再度お試しください。"
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * メールログイン/新規登録
   */
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
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          console.error("Supabase login error:", error);
          setErrorMsg(error.message || "ログインに失敗しました。");
          if (isEmailNotConfirmedError(error.message)) setShowResend(true);
          return;
        }

        const user = data.user;
        if (!user) {
          setErrorMsg("ユーザー情報を取得できませんでした。");
          return;
        }

        persistCurrentUserId(user.id);
        router.replace(`/mypage/${user.id}`);
        return;
      }

      // 新規登録（メール確認あり）
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getAuthRedirectTo("/auth/confirm?next=/login"),
          data: { name: displayName.trim() },
        },
      });

      if (error) {
        console.error("Supabase signup error:", error);
        setErrorMsg(error.message || "新規登録に失敗しました。");
        return;
      }

      // 確認前に /mypage へは飛ばさない
      setInfoMsg(
        "仮登録が完了しました。確認メールを送信しました。メール内のリンクを開いて登録を完了してください。"
      );
      return;
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

  const handleResend = async () => {
    setErrorMsg(null);
    setInfoMsg(null);

    const mail = email.trim();
    if (!mail) {
      setErrorMsg("再送するメールアドレスを入力してください。");
      return;
    }

    try {
      setResending(true);
      await resendSignupConfirmation(mail);
      setInfoMsg(
        "確認メールを再送しました。届いたメールのリンクを開いて登録を完了してください。"
      );
      setShowResend(false);
    } catch (e: any) {
      console.error("resend confirmation error:", e);
      setErrorMsg(
        e?.message ||
          "確認メールの再送に失敗しました。時間をおいて再度お試しください。"
      );
    } finally {
      setResending(false);
    }
  };

  const isLogin = mode === "login";

  return (
    <>
      <AppHeader title="ログイン / 新規登録" subtitle="LRoom アカウントへ" showBack={true} />

      <main className="login-main">
        <div className="login-container">
          {/* Google（新規/ログイン共通） */}
          <section className="oauth-card">
            <button
              type="button"
              className="oauth-btn"
              onClick={handleGoogle}
              disabled={loading || resending}
            >
              {loading ? "Googleを起動中…" : "Googleで続行（新規/ログイン共通）"}
            </button>
            <p className="oauth-note">
              Googleは初回ログイン時に自動でアカウントが作成されます。うまくいかない場合は下のメールログインも利用できます。
            </p>
          </section>

          {/* モード切り替え（メール用） */}
          <div className="login-tabs" role="tablist" aria-label="ログインモード">
            <button
              type="button"
              className={"login-tab" + (isLogin ? " login-tab--active" : "")}
              role="tab"
              aria-selected={isLogin}
              onClick={() => {
                setMode("login");
                resetMessages();
              }}
            >
              ログイン（メール）
            </button>
            <button
              type="button"
              className={"login-tab" + (!isLogin ? " login-tab--active" : "")}
              role="tab"
              aria-selected={!isLogin}
              onClick={() => {
                setMode("signup");
                resetMessages();
              }}
            >
              新規登録（メール）
            </button>
          </div>

          {/* メールフォーム */}
          <section className="login-card">
            <form onSubmit={handleSubmit} className="login-form">
              {!isLogin && (
                <div className="form-row">
                  <label className="form-label">
                    表示名
                    <span className="form-label-sub">LRoom 内で表示される名前です。</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="例）LRoom さん"
                    autoComplete="name"
                  />
                </div>
              )}

              <div className="form-row">
                <label className="form-label">メールアドレス</label>
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
                <label className="form-label">パスワード</label>
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

              {errorMsg && <div className="login-message login-message--error">{errorMsg}</div>}
              {infoMsg && !errorMsg && (
                <div className="login-message login-message--info">{infoMsg}</div>
              )}

              {isLogin && showResend && (
                <button
                  type="button"
                  className="login-resend-btn"
                  onClick={handleResend}
                  disabled={loading || resending}
                >
                  {resending ? "確認メールを再送中..." : "確認メールを再送する"}
                </button>
              )}

              <button type="submit" className="login-submit-btn" disabled={loading || resending}>
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
                  ? "メールで新規登録する場合は「新規登録（メール）」タブへ。Googleで続行する場合は上のボタンから進めます。"
                  : "すでにアカウントをお持ちの場合は「ログイン（メール）」タブへ。Googleで続行する場合は上のボタンから進めます。"}
              </p>
            </form>
          </section>

          <section className="login-subsection">
            <h2 className="login-subsection-title">ログインについて</h2>
            <p className="login-subsection-text">
              一度ログインすると、この端末ではログアウトするまで同じアカウントで LRoom を利用できます。
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

        .oauth-card {
          background: #ffffff;
          border-radius: 16px;
          padding: 14px 14px 12px;
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
          border: 1px solid var(--border);
          margin-top: 8px;
        }
        .oauth-btn {
          width: 100%;
          border-radius: 999px;
          border: 1px solid var(--border);
          padding: 10px 12px;
          font-size: 14px;
          font-weight: 700;
          background: #fff;
          cursor: pointer;
        }
        .oauth-btn:disabled {
          opacity: 0.7;
          cursor: default;
        }
        .oauth-note {
          margin: 8px 2px 0;
          font-size: 11px;
          color: var(--text-sub);
          line-height: 1.6;
        }

        .login-tabs {
          display: inline-flex;
          border-radius: 999px;
          border: 1px solid var(--border);
          padding: 2px;
          margin: 12px 0 12px;
          background: rgba(255, 255, 255, 0.8);
        }
        .login-tab {
          flex: 1;
          min-width: 140px;
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

        .login-resend-btn {
          width: 100%;
          border-radius: 999px;
          border: 1px solid var(--border);
          padding: 9px 12px;
          font-size: 13px;
          font-weight: 600;
          background: rgba(255, 255, 255, 0.9);
          color: var(--text-sub);
          cursor: pointer;
        }
        .login-resend-btn:disabled {
          opacity: 0.7;
          cursor: default;
        }

        .login-submit-btn {
          margin-top: 4px;
          width: 100%;
          border-radius: 999px;
          border: none;
          padding: 10px 12px;
          font-size: 14px;
          font-weight: 600;
          background: linear-gradient(135deg, #f3c98b, #e8b362);
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
          line-height: 1.6;
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