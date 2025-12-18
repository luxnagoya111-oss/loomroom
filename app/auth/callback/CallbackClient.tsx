// app/auth/callback/CallbackClient.tsx
"use client";

import React, { useEffect, useState } from "react";
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

function isRecoverableOAuthErrorMessage(msg: string): boolean {
  const s = (msg || "").toLowerCase();
  return (
    s.includes("code verifier") ||
    s.includes("code_verifier") ||
    s.includes("invalid request") ||
    s.includes("invalid_grant") ||
    s.includes("pkce") ||
    s.includes("400")
  );
}

function parseHashParams(hash: string): Record<string, string> {
  const h = (hash || "").replace(/^#/, "");
  const params = new URLSearchParams(h);
  const obj: Record<string, string> = {};
  params.forEach((v, k) => (obj[k] = v));
  return obj;
}

export default function CallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>("processing");
  const [message, setMessage] = useState("ログイン処理中です…");
  const [canRecover, setCanRecover] = useState(false);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
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

    const upsertUsersRowBestEffort = async (uid: string, user: any) => {
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
          const { error: upErr } = await supabase.from("users").update({ name: nameToSave }).eq("id", uid);
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
    };

    const run = async () => {
      try {
        // 1) error が来ていれば即失敗
        const error = searchParams.get("error");
        const errorDesc = searchParams.get("error_description");
        if (error || errorDesc) {
          fail(`認証に失敗しました：${errorDesc ?? error ?? "unknown error"}`);
          return;
        }

        // 2) まず hash（implicit）を吸う： #access_token=... #refresh_token=...
        //    ※ code が無くても成功できるようにする
        const hashObj = parseHashParams(typeof window !== "undefined" ? window.location.hash : "");
        const access_token = hashObj["access_token"];
        const refresh_token = hashObj["refresh_token"];

        if (access_token && refresh_token) {
          const { data, error: setErr } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });

          if (setErr) {
            fail(`セッション確立に失敗しました：${setErr.message}`);
            return;
          }

          const uid = data.session?.user?.id ?? null;
          if (!uid) {
            fail("ユーザー情報を取得できませんでした。");
            return;
          }

          // hash を残すと再読み込み時に事故るので消す
          try {
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          } catch {}

          await upsertUsersRowBestEffort(uid, data.session?.user);
          succeedAndGo(uid);
          return;
        }

        // 3) 次に code（PKCE）を吸う
        const code = searchParams.get("code");
        if (code) {
          const { data, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
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

          await upsertUsersRowBestEffort(uid, user);
          succeedAndGo(uid);
          return;
        }

        // 4) 保険：すでに session があればそれを採用
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) {
          fail(`セッション確認に失敗しました：${sessionErr.message}`);
          return;
        }
        const uid = sessionData?.session?.user?.id ?? null;
        if (uid) {
          succeedAndGo(uid);
          return;
        }

        // 5) ここまで来たら本当に失敗
        fail(
          "認証情報を取得できませんでした。\nこのページを更新したか、ログイン処理が途中で中断された可能性があります。\n「ログイン状態をリセットしてやり直す」を押して、/login から再度 Google ログインしてください。"
        );
      } catch (e: any) {
        console.error("[auth/callback] unexpected error:", e);
        fail(e?.message ?? "不明なエラーが発生しました。");
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

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

            <p style={{ margin: 0, fontSize: 13, opacity: 0.8, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
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
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}