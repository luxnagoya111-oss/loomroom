"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/lib/supabaseClient";
import { persistCurrentUserId } from "@/lib/auth";

type Step = "verifying" | "success" | "error";

function readHashParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  const hash = window.location.hash?.replace(/^#/, "") ?? "";
  return new URLSearchParams(hash);
}

export default function CallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>("verifying");
  const [message, setMessage] = useState<string>("ログイン情報を検証しています…");

  const params = useMemo(() => {
    const q_code = searchParams.get("code");
    const q_next = searchParams.get("next");

    const hp = readHashParams();
    const h_code = hp.get("code");
    const h_next = hp.get("next");

    const h_access_token = hp.get("access_token");
    const h_refresh_token = hp.get("refresh_token");

    const h_error = hp.get("error");
    const h_error_desc = hp.get("error_description");

    return {
      code: q_code ?? h_code,
      next: q_next ?? h_next,
      access_token: h_access_token,
      refresh_token: h_refresh_token,
      error: h_error,
      error_description: h_error_desc,
    };
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    const setFailure = (msg: string) => {
      if (cancelled) return;
      setStep("error");
      setMessage(msg);
    };

    const setSuccess = async (userId: string) => {
      try {
        // users へ upsert（最低限）
        const { data: u } = await supabase.auth.getUser();
        const user = u.user;

        const nameFromMeta =
          (user?.user_metadata?.name as string | undefined) ||
          (user?.user_metadata?.full_name as string | undefined) ||
          null;

        // RLSが「auth.uid() = id」の前提ならこれで通る想定
        const { error: upsertError } = await supabase.from("users").upsert(
          {
            id: userId,
            name: nameFromMeta,
            role: "user",
          },
          { onConflict: "id" }
        );

        if (upsertError) {
          // upsert失敗でもログイン自体は成功なので、落とさずに進む（ただログに残す）
          console.error("[auth/callback.users.upsert] error:", upsertError);
        }
      } catch (e) {
        console.error("[auth/callback.users.upsert] unexpected:", e);
      }

      persistCurrentUserId(userId);

      if (cancelled) return;
      setStep("success");
      setMessage("ログインが完了しました。");
      router.replace(`/mypage/${userId}`);
    };

    const run = async () => {
      try {
        // OAuthエラーが返ってきた
        if (params.error) {
          setFailure(
            params.error_description
              ? decodeURIComponent(params.error_description)
              : "ログインに失敗しました。"
          );
          return;
        }

        // PKCE: code がある → exchange
        if (params.code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(
            params.code
          );
          if (error) throw error;

          const userId =
            (data as any)?.user?.id || (data as any)?.session?.user?.id || null;

          if (!userId) {
            setFailure("ユーザー情報を取得できませんでした。");
            return;
          }

          await setSuccess(userId);
          return;
        }

        // implicit: access_token/refresh_token
        if (params.access_token && params.refresh_token) {
          const { data, error } = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });
          if (error) throw error;

          const userId =
            (data as any)?.user?.id || (data as any)?.session?.user?.id || null;

          if (!userId) {
            setFailure("ユーザー情報を取得できませんでした。");
            return;
          }

          await setSuccess(userId);
          return;
        }

        // すでにセッションがある
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionUserId = sessionData?.session?.user?.id ?? null;
        if (sessionUserId) {
          await setSuccess(sessionUserId);
          return;
        }

        setFailure("コールバック情報を判別できませんでした。");
      } catch (e: any) {
        console.error("[auth/callback] error:", e);
        setFailure(
          e?.message ||
            "ログインに失敗しました。時間をおいて再度お試しください。"
        );
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [
    params.code,
    params.next,
    params.access_token,
    params.refresh_token,
    params.error,
    params.error_description,
    router,
  ]);

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
              {step === "verifying"
                ? "確認中"
                : step === "success"
                ? "完了"
                : "失敗"}
            </h1>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.8, lineHeight: 1.7 }}>
              {message}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}