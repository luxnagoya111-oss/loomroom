// app/auth/callback/CallbackClient.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
 * PKCE/コード交換系の失敗は、状態リセット → やり直しで直ることが多い
 */
function isRecoverableOAuthErrorMessage(msg: string): boolean {
  const s = (msg || "").toLowerCase();
  return (
    s.includes("code verifier") ||
    s.includes("code_verifier") ||
    s.includes("invalid request") ||
    s.includes("invalid_grant") ||
    s.includes("pkce") ||
    s.includes("validation_failed")
  );
}

function stripOAuthParamsFromUrl(url: URL) {
  url.searchParams.delete("code");
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  url.searchParams.delete("state");
}

export default function CallbackClient() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("processing");
  const [message, setMessage] = useState("ログイン処理中です…");
  const [canRecover, setCanRecover] = useState(false);
  const [recovering, setRecovering] = useState(false);

  // StrictMode / リロード / 戻る等でも二重実行しない
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

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
      router.replace(`/mypage/${uid}`);
    };

    const run = async () => {
      try {
        const url = new URL(window.location.href);

        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");
        const errorDesc = url.searchParams.get("error_description");

        if (error || errorDesc) {
          // ここは交換処理をしない（純粋に失敗表示）
          const text = errorDesc ?? error ?? "unknown error";
          fail(`認証に失敗しました：${text}`);
          return;
        }

        // code が無い場合：
        // - callbackに何らかの理由でパラメータ無しで来た
        // - 既に交換済みでURLだけ消えている
        // のどちらか。セッション確認してダメならリセット導線へ。
        if (!code) {
          const { data: sessionData, error: sessionErr } =
            await supabase.auth.getSession();

          if (sessionErr) {
            fail(`セッション確認に失敗しました：${sessionErr.message}`);
            return;
          }

          const uid = sessionData?.session?.user?.id ?? null;
          if (!uid) {
            fail(
              "認証情報が見つかりませんでした。\n「ログイン状態をリセットしてやり直す」から /login に戻り、再度 Google ログインしてください。"
            );
            return;
          }

          // 既にログイン済み
          succeedAndGo(uid);
          return;
        }

        // ★本丸：code → session（このページでのみ実施）
        const { data, error: exErr } =
          await supabase.auth.exchangeCodeForSession(code);

        if (exErr) {
          fail(`セッション確立に失敗しました：${exErr.message}`);
          return;
        }

        const user = (data as any)?.user ?? (data as any)?.session?.user ?? null;
        const uid = user?.id ?? null;

        if (!uid) {
          fail("ユーザー情報を取得できませんでした。");
          return;
        }

        // ★二重交換防止：成功したら code 等をURLから消す
        try {
          stripOAuthParamsFromUrl(url);
          window.history.replaceState({}, "", url.toString());
        } catch {
          // noop
        }

        // users upsert（失敗してもログイン自体は成立しているので続行）
        try {
          const name = pickNameFromUser(user);

          const { data: existing } = await supabase
            .from("users")
            .select("id, role, name")
            .eq("id", uid)
            .maybeSingle();

          const roleToSave = (existing as any)?.role ?? "user";
          const nameToSave =
            String((existing as any)?.name ?? name).trim() || "LRoom";

          if ((existing as any)?.id) {
            // ここでは name 更新のみ（roleは勝手に変えない）
            await supabase
              .from("users")
              .update({ name: nameToSave })
              .eq("id", uid);
          } else {
            await supabase
              .from("users")
              .insert([{ id: uid, name: nameToSave, role: roleToSave }]);
          }
        } catch (e) {
          console.warn("[auth/callback] users upsert skipped:", e);
        }

        succeedAndGo(uid);
      } catch (e: any) {
        console.error("[auth/callback] unexpected error:", e);
        fail(e?.message ?? "不明なエラーが発生しました。");
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleRecover = async () => {
    try {
      setRecovering(true);
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
                  何度も失敗する場合は、同じ端末・同じブラウザで開き直してください。
                  <br />
                  それでも直らない場合は、いったんブラウザのCookie/サイトデータを削除してください。
                </p>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}