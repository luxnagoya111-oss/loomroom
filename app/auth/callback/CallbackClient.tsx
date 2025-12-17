// app/auth/callback/CallbackClient.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/lib/supabaseClient";
import { persistCurrentUserId } from "@/lib/auth";

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

export default function CallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>("processing");
  const [message, setMessage] = useState("ログイン処理中です…");

  useEffect(() => {
    let cancelled = false;

    const fail = (msg: string) => {
      if (cancelled) return;
      setStep("error");
      setMessage(msg);
    };

    const run = async () => {
      try {
        const code = searchParams.get("code");
        const errorDesc = searchParams.get("error_description");
        const error = searchParams.get("error");

        if (error || errorDesc) {
          fail(`認証に失敗しました：${errorDesc ?? error ?? "unknown error"}`);
          return;
        }

        // code が無い場合でも session が残っているケースがあるので保険
        if (!code) {
          const { data: sessionData } = await supabase.auth.getSession();
          const uid = sessionData.session?.user?.id ?? null;
          if (!uid) {
            fail("認証コードが見つかりませんでした。もう一度 Google でログインしてください。");
            return;
          }
          persistCurrentUserId(uid);
          if (cancelled) return;
          setStep("success");
          setMessage("ログインしました。移動します…");
          router.replace(`/mypage/${uid}`);
          return;
        }

        // ★ここが本丸：code → session 交換
        const { data, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exErr) {
          fail(`セッション確立に失敗しました：${exErr.message}`);
          return;
        }

        const user = data.user ?? data.session?.user ?? null;
        const uid = user?.id ?? null;
        if (!uid) {
          fail("ユーザー情報を取得できませんでした。");
          return;
        }

        // 互換運用：localStorage に uuid 保存
        persistCurrentUserId(uid);

        // usersテーブル upsert（RLSで失敗してもログイン自体は続行）
        try {
          const name = pickNameFromUser(user);

          const { data: existing } = await supabase
            .from("users")
            .select("id, role, name")
            .eq("id", uid)
            .maybeSingle();

          const roleToSave = existing?.role ?? "user";
          const nameToSave = (existing?.name ?? name).trim() || "LRoom";

          if (existing?.id) {
            await supabase.from("users").update({ name: nameToSave }).eq("id", uid);
          } else {
            await supabase
              .from("users")
              .insert([{ id: uid, name: nameToSave, role: roleToSave }]);
          }
        } catch (e) {
          console.warn("[auth/callback] users upsert skipped:", e);
        }

        if (cancelled) return;
        setStep("success");
        setMessage("ログインしました。移動します…");
        router.replace(`/mypage/${uid}`);
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
              >
                ログイン画面へ戻る
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}