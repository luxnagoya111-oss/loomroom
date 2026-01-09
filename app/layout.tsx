// app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import AgeGate from "@/components/AgeGate";
import PwaRegister from "@/app/_components/PwaRegister";

export const metadata: Metadata = {
  title: "LRoom",
  description: "LRoom",

  applicationName: "LRoom",
  manifest: "/manifest.webmanifest",

  // ❌ Next 16 では metadata.themeColor は非対応（警告の原因）
  // themeColor: "#ffffff",

  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LRoom",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png" }],
  },
};

// ✅ themeColor は viewport export に移動
export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {/* PWA: Service Worker 登録 */}
        <PwaRegister />

        {children}

        {/* 18歳確認オーバーレイ（クライアント側でのみ動作） */}
        <AgeGate />
      </body>
    </html>
  );
}