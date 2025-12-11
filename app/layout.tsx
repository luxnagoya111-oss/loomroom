// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import AgeGate from "@/components/AgeGate";

export const metadata: Metadata = {
  title: "LoomRoom",
  description: "LoomRoom",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        {children}
        {/* 18歳確認オーバーレイ（クライアント側でのみ動作） */}
        <AgeGate />
      </body>
    </html>
  );
}