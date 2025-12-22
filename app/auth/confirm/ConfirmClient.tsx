// app/auth/confirm/ConfirmClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

export default function ConfirmClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>("verifying");
  const [message, setMessage] = useState<string>("確認リンクを検証しています…");

  const params = useMemo(() => {
    // query
    const q_code = searchParams.get("code");
    const q_token_hash = searchParams.get("token_hash");
    const q_type = searchParams.get("type");
    const q_next = searchParams.get("next");

    // hash
    const hp = readHashParams();
    const h_code = hp.get("code");
    const h_token_hash = hp.get("token_hash");
    const h_type = hp.get("type");
    const h_next = hp.get("next");

    // implicit session tokens（#access_token=...）
    const h_access_token = hp.get("access_token");
    const h_refresh_token = hp.get("refresh_token");

    // error（#error=access_denied&error_code=...）
    const h_error = hp.get("error");
    const h_error_code = hp.get("error_code");
    const h_error_desc = hp.get("error_description");

    return {
      code: q_code ?? h_code,
      token_hash: q_token_hash ?? h_token_hash,
      type: q_type ?? h_type,
      next: q_next ?? h_next,
      access_token: h_access_token,
      refresh_token: h_refresh_token,
      error: h_error,
      error_code: h_error_code,
      error_description: h_error_desc,
    };
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    const setSuccess = (userId?: string | null) => {
      if (userId) persistCurrentUserId(userId);
      if (cancelled) return;
      setStep("success");
      setMessage("メール確認が完了しました。ログインを続けてください。");
    };

    const setFailure = (msg: string) => {
      if (cancelled) return;
      setStep("error");
      setMessage(msg);
    };

    const run = async () => {
      try {
        // 0) hash にエラー情報が来ている（例：otp_expired）
        if (params.code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);

          if (error) {
            const msg = String(error?.message ?? "");
            // ★ PKCEの code_verifier が無い典型
            if (msg.includes("code verifier") || msg.includes("code_verifier")) {
              setFailure(
                "確認に失敗しました。登録したときと同じ端末・同じブラウザでリンクを開いてください。別端末で開いた場合は、ログイン画面から確認メールを再送してください。（code_verifier_missing）"
              );
              return;
            }
            throw error;
          }

          const userId =
            (data as any)?.user?.id ||
            (data as any)?.session?.user?.id ||
            null;

          setSuccess(userId);
          return;
        }

        // 2) token_hash&type=signup（verifyOtp）
        if (params.token_hash && params.type) {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: params.token_hash,
            type: params.type as any,
          });
          if (error) throw error;

          const userId =
            (data as any)?.user?.id ||
            (data as any)?.session?.user?.id ||
            null;

          setSuccess(userId);
          return;
        }

        // 3) implicit grant: #access_token & #refresh_token
        if (params.access_token && params.refresh_token) {
          const { data, error } = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });
          if (error) throw error;

          const userId =
            (data as any)?.user?.id ||
            (data as any)?.session?.user?.id ||
            null;

          setSuccess(userId);
          return;
        }

        // 4) パラメータ無しでも、すでに session があるなら「確認済み」とみなす
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionUserId = sessionData?.session?.user?.id ?? null;
        if (sessionUserId) {
          setSuccess(sessionUserId);
          return;
        }

        // どれでもない
        setFailure("確認リンクの形式を判別できませんでした。");
      } catch (e: any) {
        console.error("[auth/confirm] verify error:", e);
        setFailure(
          e?.message ||
            "確認に失敗しました。リンクの期限切れの可能性があります。"
        );
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [
    params.code,
    params.token_hash,
    params.type,
    params.access_token,
    params.refresh_token,
    params.error,
    params.error_code,
    params.error_description,
  ]);

  const goNext = () => {
    const next = params.next;
    if (next && next.startsWith("/")) {
      router.replace(next);
      return;
    }
    router.replace("/login");
  };

  return (
    <div className="app-shell">
      <AppHeader title="メール確認" subtitle="LRoom" showBack={false} />
      <main className="app-main">
        <div className="confirm-root">
          <div
            className={
              "confirm-card " +
              (step === "success"
                ? "confirm-card--success"
                : step === "error"
                ? "confirm-card--error"
                : "")
            }
          >
            <h1 className="confirm-title">
              {step === "verifying"
                ? "確認中"
                : step === "success"
                ? "確認完了"
                : "確認できませんでした"}
            </h1>

            <p className="confirm-text">{message}</p>

            {step === "success" && (
              <button className="confirm-btn" onClick={goNext}>
                ログインへ進む
              </button>
            )}

            {step === "error" && (
              <>
                <Link className="confirm-btn" href="/login">
                  ログイン画面へ
                </Link>
                <p className="confirm-sub">
                  期限切れの場合は、ログイン画面の「確認メールを再送する」から再送してください。
                </p>
              </>
            )}
          </div>
        </div>
      </main>

      <style jsx>{`
        .confirm-root {
          padding: 18px 12px 80px;
          display: flex;
          justify-content: center;
        }
        .confirm-card {
          width: 100%;
          max-width: 520px;
          background: #ffffff;
          border-radius: 16px;
          padding: 18px 14px 16px;
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
          border: 1px solid var(--border);
        }
        .confirm-card--success {
          border-color: rgba(34, 197, 94, 0.35);
        }
        .confirm-card--error {
          border-color: rgba(239, 68, 68, 0.35);
        }
        .confirm-title {
          margin: 0 0 8px;
          font-size: 16px;
          font-weight: 700;
        }
        .confirm-text {
          margin: 0 0 12px;
          font-size: 13px;
          color: var(--text-sub);
          line-height: 1.7;
        }
        .confirm-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
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
          text-decoration: none;
        }
        .confirm-sub {
          margin: 10px 2px 0;
          font-size: 11px;
          color: var(--text-sub);
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}