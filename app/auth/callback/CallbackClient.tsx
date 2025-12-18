// app/auth/callback/CallbackClient.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/lib/supabaseClient";
import { persistCurrentUserId, resetAuthFlow } from "@/lib/auth";

type Step = "processing" | "success" | "error";

function pickNameFromUser(user: any): string {
  const meta = user?.user_metadata ?? {};
  return (
    meta.name ||
    meta.full_name ||
    meta.preferred_username ||
    user?.email?.split("@")?.[0] ||
    "LRoom"
  );
}

/**
 * Supabase OAuth の典型的な失敗（PKCE/コード交換系）をざっくり判定
 * - 400 invalid request
 * - code_verifier_missing
 * - invalid_grant
 */
function isRecoverableOAuthErrorMessage(msg: string): boolean {
  const s = (msg || "").toLowerCase();
  return (
    s.includes("code verifier") ||
    s.includes("code_verifier") ||
    s.includes("invalid request") ||
    s.includes("invalid_grant") ||
    s.includes("400")
  );
}

function stripOAuthParamsFromUrl() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("code");
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    url.searchParams.delete("state");
    // Next の内部パラメータ等があれば必要に応じて追加で消す
    window.history.replaceState({}, "", url.toString());
  } catch {
    // noop
  }
}

export default function CallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>("processing");
  const [message, setMessage] = useState("ログイン処理中です…");
  const [canRecover, setCanRecover] = useState(false);
  const [recovering, setRecovering] = useState(false);

  // ★ 二重実行ガード（Next/Reactの再レンダで effect が複数回走るのを防ぐ）
  const didRunRef = useRef(false);

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;

    let cancelled = false;

    const fail = (msg: string) => {
      if (cancelled) return;
      setStep("error");
      setMessage(msg);
      setCanRecover(isRecoverableOAuthErrorMessage(msg));
    };

    const succeedAndGo = (uid: string) => {
      persistCurrentUserId(uid);
      if (cancelled) return;
      setStep("success");
      setMessage("ログインしました。移動します…");
      // ★ callback に留まらない（リロード時に code 無しで再評価されるのを防ぐ）
      router.replace(`/mypage/${uid}`);
    };

    const run = async () => {
      try {
        // Google など OAuth から戻ると query で code / error が来る
        const code = searchParams.get("code");
        const error = searchParams.get("error");
        const errorDesc = searchParams.get("error_description");

        if (error || errorDesc) {
          // エラーが来ている場合はパラメータを消してから失敗表示
          stripOAuthParamsFromUrl();
          fail(`認証に失敗しました：${errorDesc ?? error ?? "unknown error"}`);
          return;
        }

        /**
         * ★重要変更：
         * code が無い場合に「getSession() を拾って成功扱い」にしない
         *
         * 理由：
         * - Supabase側の users を消してもブラウザに session が残る
         * - その session を getSession で拾うと「前のデータでログインした」ように見える
         *
         * → callback は OAuth の戻り口なので、code が無いなら「正常な戻りではない」扱いにする
         *   （リロードや直打ち等は /login へ戻す）
         */
        if (!code) {
          stripOAuthParamsFromUrl();
          fail(
            "認証コードが見つかりませんでした。\nこのページを更新したか、ログイン処理が途中で中断された可能性があります。\n「ログイン状態をリセットしてやり直す」を押して、/login から再度 Google ログインしてください。"
          );
          return;
        }

        /**
         * 2) code → session 交換（本丸）
         */
        const { data, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exErr) {
          stripOAuthParamsFromUrl();
          fail(`セッション確立に失敗しました：${exErr.message}`);
          return;
        }

        const user = (data as any)?.user ?? (data as any)?.session?.user ?? null;
        const uid = user?.id ?? null;
        if (!uid) {
          stripOAuthParamsFromUrl();
          fail("ユーザー情報を取得できませんでした。");
          return;
        }

        // ★ URL に code が残ると再訪問/再レンダで事故るので消す
        stripOAuthParamsFromUrl();

        // localStorage 同期
        persistCurrentUserId(uid);

        /**
         * 3) users テーブル upsert（失敗してもログイン自体は継続）
         * - RLS やタイミングで落ちやすいので、例外は握りつぶす
         */
        try {
          const name = pickNameFromUser(user);

          const { data: existing, error: ex1 } = await supabase
            .from("users")
            .select("id, role, name")
            .eq("id", uid)
            .maybeSingle();

          if (ex1) throw ex1;

          const roleToSave = (existing as any)?.role ?? "user";
          const nameToSave = String((existing as any)?.name ?? name).trim() || "LRoom";

          if ((existing as any)?.id) {
            const { error: upErr } = await supabase
              .from("users")
              .update({ name: nameToSave })
              .eq("id", uid);
            if (upErr) throw upErr;
          } else {
            const { error: inErr } = await supabase
              .from("users")
              .insert([{ id: uid, name: nameToSave, role: roleToSave }]);
            if (inErr) throw inErr;
          }
        } catch (e) {
          console.warn("[auth/callback] users upsert skipped:", e);
        }

        if (cancelled) return;
        succeedAndGo(uid);
      } catch (e: any) {
        console.error("[auth/callback] unexpected error:", e);
        stripOAuthParamsFromUrl();
        fail(e?.message ?? "不明なエラーが発生しました。");
      }
    };

    run();

    return () => {
      cancelled = true;
    };
    // ★ searchParams を依存に入れると再実行の温床になりやすいので入れない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const handleRecover = async () => {
    try {
      setRecovering(true);
      // 壊れたPKCE/セッションを掃除して再試行できる状態に戻す
      await resetAuthFlow();
      router.replace("/login");
    } finally {
      setRecovering(false);
    }
  };

  return (
    <div className="app-shell">
      <AppHeader title="ログイン" subtitle="LRoom" showBack={false} />

      <main className="app-main" style={{ padding: 16 }}>
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: "18px 14px 16px",
              boxShadow: "0 12px 32px rgba(15, 23, 42, 0.06)",
              border: "1px solid rgba(0,0,0,0.08)",
            }}
          >
            <h1 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>
              {step === "processing" ? "処理中" : step === "success" ? "完了" : "失敗"}
            </h1>

            <p
              style={{
                margin: 0,
                fontSize: 13,
                opacity: 0.8,
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
              }}
            >
              {message}
            </p>

            {step === "error" && (
              <>
                <button
                  style={{
                    marginTop: 12,
                    width: "100%",
                    borderRadius: 999,
                    border: "none",
                    padding: "10px 12px",
                    fontSize: 14,
                    fontWeight: 600,
                    background: "linear-gradient(135deg, #f3c98b, #e8b362)",
                    color: "#4a2b05",
                    cursor: "pointer",
                  }}
                  onClick={() => router.replace("/login")}
                  disabled={recovering}
                >
                  ログイン画面へ戻る
                </button>

                {canRecover && (
                  <button
                    style={{
                      marginTop: 10,
                      width: "100%",
                      borderRadius: 999,
                      border: "1px solid rgba(0,0,0,0.12)",
                      padding: "10px 12px",
                      fontSize: 14,
                      fontWeight: 700,
                      background: "rgba(255,255,255,0.9)",
                      color: "rgba(0,0,0,0.72)",
                      cursor: "pointer",
                    }}
                    onClick={handleRecover}
                    disabled={recovering}
                  >
                    {recovering ? "リセット中…" : "ログイン状態をリセットしてやり直す"}
                  </button>
                )}

                <p style={{ marginTop: 10, fontSize: 11, opacity: 0.7, lineHeight: 1.6 }}>
                  何度も失敗する場合は、同じ端末・同じブラウザで /login を開き直してください。
                  <br />
                  それでも直らない場合は、いったんブラウザの Cookie/サイトデータを削除してください。
                </p>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}