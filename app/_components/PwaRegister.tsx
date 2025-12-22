// app/_components/PwaRegister.tsx
"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const onLoad = async () => {
      try {
        // sw.js は public 配下なので /sw.js
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (e) {
        // 失敗してもアプリは動かす（静かに）
        console.warn("[PWA] service worker register failed:", e);
      }
    };

    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}