// app/dev/login/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * ここでログインとして扱うIDを localStorage に保存する。
 * 全ページではこれを getCurrentUserId() で参照する想定。
 */

export default function DevLoginPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);

  // 起動時に localStorage の値を読み込む
  useEffect(() => {
    if (typeof window !== "undefined") {
      setSavedId(localStorage.getItem("loomroom_current_user"));
    }
  }, []);

  const handleSave = () => {
    const trimmed = userId.trim();
    if (!trimmed) {
      alert("ID を入力してください");
      return;
    }
    localStorage.setItem("loomroom_current_user", trimmed);
    alert(`ログインIDを「${trimmed}」として保存しました`);
    router.push("/");
  };

  const handleClear = () => {
    localStorage.removeItem("loomroom_current_user");
    alert("ログインIDをクリアしました");
    router.refresh();
  };

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: "20px", marginBottom: "12px" }}>
        Dev Login（仮ログイン）
      </h1>

      <p style={{ marginBottom: "8px", color: "#666" }}>
        現在のログインID：
      </p>
      <div
        style={{
          padding: "8px 12px",
          background: "#fafafa",
          borderRadius: "8px",
          marginBottom: "14px",
          border: "1px solid #ddd",
          fontSize: "14px",
        }}
      >
        {savedId || "なし（未ログイン扱い）"}
      </div>

      <div style={{ marginBottom: "16px" }}>
        <input
          type="text"
          placeholder="例: u_test001 / t_taki / s_lux など"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          style={{
            width: "100%",
            padding: "10px",
            border: "1px solid #ccc",
            borderRadius: "8px",
            fontSize: "14px",
          }}
        />
      </div>

      <button
        onClick={handleSave}
        style={{
          width: "100%",
          padding: "10px",
          background: "#d9b567",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
          fontSize: "15px",
          fontWeight: 600,
          marginBottom: "10px",
        }}
      >
        このIDでログイン
      </button>

      <button
        onClick={handleClear}
        style={{
          width: "100%",
          padding: "10px",
          background: "#999",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
          fontSize: "14px",
        }}
      >
        ログイン情報をクリア
      </button>

      <p style={{ marginTop: "20px", fontSize: "12px", color: "#888" }}>
        ※ このログインは開発用です。localStorage のみで動きます。
      </p>
    </div>
  );
}
