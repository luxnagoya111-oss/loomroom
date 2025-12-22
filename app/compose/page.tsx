// app/compose/page.tsx
import React, { Suspense } from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import ComposeClient from "./ComposeClient";

// 静的プリレンダーを避ける（CSR要素が多いページなので安全）
export const dynamic = "force-dynamic";

export default function ComposePage() {
  const hasUnread = false;

  return (
    <div className="app-root">
      <AppHeader title="投稿を作成" />

      <main className="app-main compose-main">
        {/* useSearchParams を内部で使う可能性があるコンポーネント群への対策 */}
        <Suspense fallback={<div style={{ padding: 16, fontSize: 13 }}>読み込み中…</div>}>
          <ComposeClient />
        </Suspense>
      </main>

      <BottomNav active="compose" hasUnread={hasUnread} />

      <style jsx>{`
        .compose-main {
          padding: 12px 16px 140px;
        }
      `}</style>
    </div>
  );
}