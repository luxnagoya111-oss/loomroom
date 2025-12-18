"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { persistCurrentUserId, resetAuthFlow } from "@/lib/auth";

export default function CallbackClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    const run = async () => {
      // 二重実行ガード（Reactの挙動/再描画/復帰で2回走るのを防ぐ）
      if (runningRef.current) return;
      runningRef.current = true;

      try {
        const code = sp.get("code");
        const err = sp.get("error");
        const errDesc = sp.get("error_description");

        // OAuth側が error を返してきた
        if (err) {
          setError(`${err}${errDesc ? `: ${errDesc}` : ""}`);
          return;
        }

        // ★重要：code が無いなら exchange しない（2回目の余計なPOSTを止める）
        if (!code) {
          // すでにセッションがあるなら成功扱いで進める
          const { data } = await supabase.auth.getSession();
          const uid = data.session?.user?.id ?? null;
          if (uid) {
            persistCurrentUserId(uid);
            router.replace(`/mypage/${uid}`);
            return;
          }

          setError("認証コードが見つかりませんでした。/login からやり直してください。");
          return;
        }

        // code がある時だけ交換する
        const { data, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exErr) {
          setError(exErr.message || "セッション確立に失敗しました。");
          return;
        }

        const uid = data.session?.user?.id ?? null;
        if (!uid) {
          setError("セッションを取得できませんでした。");
          return;
        }

        persistCurrentUserId(uid);
        router.replace(`/mypage/${uid}`);
      } catch (e: any) {
        setError(e?.message || "ログイン処理でエラーが発生しました。");
      }
    };

    run();
    // sp を依存に入れると変化時に再実行されやすいので、ここは入れない方が安定しやすい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  if (!error) {
    return <div style={{ padding: 16 }}>ログイン中…</div>;
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>失敗</div>
        <div style={{ whiteSpace: "pre-wrap", opacity: 0.8 }}>{error}</div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={() => router.replace("/login")}>ログイン画面へ戻る</button>
          <button
            onClick={async () => {
              await resetAuthFlow();
              router.replace("/login");
            }}
          >
            ログイン状態をリセットしてやり直す
          </button>
        </div>
      </div>
    </div>
  );
}