// app/auth/confirm/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/lib/supabaseClient";
import { persistCurrentUserId } from "@/lib/auth";

type Step = "verifying" | "success" | "error";

export default function AuthConfirmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>("verifying");
  const [message, setMessage] = useState<string>("確認リンクを検証しています…");

  const params = useMemo(() => {
    const code = searchParams.get("code");
    const token_hash = searchParams.get("token_hash");
    const type = searchParams.get("type"); // signup / recovery / email_change など
    const next = searchParams.get("next"); // 任意（自前で付けるなら）
    return { code, token_hash, type, next };
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        // 1) code=... が来るパターン（推奨）
        if (params.code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(
            params.code
          );
          if (error) throw error;

          const userId = data?.user?.id;
          if (userId) persistCurrentUserId(userId);

          if (cancelled) return;
          setStep("success");
          setMessage("メール確認が完了しました。ログインを続けてください。");
          return;
        }

        // 2) token_hash&type=signup が来るパターン
        if (params.token_hash && params.type) {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: params.token_hash,
            type: params.type as any,
          });
          if (error) throw error;

          const userId = data?.user?.id;
          if (userId) persistCurrentUserId(userId);

          if (cancelled) return;
          setStep("success");
          setMessage("メール確認が完了しました。ログインを続けてください。");
          return;
        }

        // どちらのパラメータも無い
        throw new Error("確認リンクの形式を判別できませんでした。");
      } catch (e: any) {
        console.error("[auth/confirm] verify error:", e);
        if (cancelled) return;
        setStep("error");
        setMessage(
          e?.message ||
            "確認に失敗しました。リンクの期限切れの可能性があります。"
        );
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [params.code, params.token_hash, params.type]);

  const goNext = () => {
    // next を使うならここ（安全な相対パスだけ許可）
    const next = params.next;
    if (next && next.startsWith("/")) {
      router.push(next);
      return;
    }
    router.push("/login");
  };

  return (
    <div className="app-shell">
      <AppHeader title="メール確認" subtitle="LoomRoom" showBack={false} />
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