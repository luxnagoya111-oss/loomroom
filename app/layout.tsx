// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loomroom",
  description: "Loomroom｜クリエイター用ルーム管理アプリ（仮）",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-zinc-100 text-zinc-900">
        {/* 全体ラッパー */}
        <div className="min-h-screen flex flex-col">
          {/* 共通ヘッダー */}
          <header className="border-b bg-white/80 backdrop-blur">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold tracking-tight">
                  Loomroom
                </span>
                <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white">
                  beta
                </span>
              </div>
              <nav className="flex gap-4 text-sm text-zinc-600">
                <button className="hover:text-zinc-900 transition-colors">
                  ホーム
                </button>
                <button className="hover:text-zinc-900 transition-colors">
                  機能
                </button>
                <button className="hover:text-zinc-900 transition-colors">
                  ロードマップ
                </button>
              </nav>
            </div>
          </header>

          {/* ページごとの中身 */}
          <main className="flex-1">
            <div className="mx-auto max-w-5xl px-6 py-10">{children}</div>
          </main>

          {/* 共通フッター */}
          <footer className="border-t bg-white/80">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4 text-xs text-zinc-500">
              <span>© {new Date().getFullYear()} Loomroom</span>
              <span>Built by LuX nagoya team</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}