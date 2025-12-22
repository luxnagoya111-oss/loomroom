// app/auth/confirm/page.tsx
import React, { Suspense } from "react";
import ConfirmClient from "./ConfirmClient";

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={<ConfirmFallback />}>
      <ConfirmClient />
    </Suspense>
  );
}

function ConfirmFallback() {
  // ここは最小限でOK（ビルド対策の fallback）
  return (
    <div className="app-shell">
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
              確認中
            </h1>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.75, lineHeight: 1.7 }}>
              確認リンクを検証しています…
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}