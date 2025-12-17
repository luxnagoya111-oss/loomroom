"use client";

import React, { useEffect, useState } from "react";

const STORAGE_KEY = "loomroom_age_confirmed_v1";

function isBrowser() {
  return typeof window !== "undefined";
}

/**
 * 18歳以上確認モーダル
 *
 * - localStorage[loomroom_age_confirmed_v1] === "yes" のときは何も表示しない
 * - それ以外のときに全画面オーバーレイで表示
 * - 「はい」で yes を保存し、以後表示しない
 * - 「いいえ」で外部サイトへ退避（とりあえず Google）
 */
export default function AgeGate() {
  const [isChecking, setIsChecking] = useState(true);
  const [isConfirmed, setIsConfirmed] = useState(false);

  useEffect(() => {
    if (!isBrowser()) {
      // SSR 時は何もしない
      setIsChecking(false);
      return;
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "yes") {
      setIsConfirmed(true);
    }
    setIsChecking(false);
  }, []);

  if (isChecking || isConfirmed) {
    // 判定中 or すでに確認済み → 何も出さない
    return null;
  }

  const handleYes = () => {
    if (!isBrowser()) return;
    window.localStorage.setItem(STORAGE_KEY, "yes");
    setIsConfirmed(true);
  };

  const handleNo = () => {
    if (!isBrowser()) return;
    window.location.href = "https://www.google.com";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="max-w-sm w-full mx-4 rounded-2xl bg-white shadow-lg p-6">
        <h2 className="text-lg font-semibold mb-4 text-center">
          18歳以上の方のみご利用いただけます
        </h2>
        <p className="text-sm text-gray-700 mb-6 text-center leading-relaxed">
          LRoomは18歳以上の方のみを対象としたサービスです。
          <br />
          あなたは18歳以上ですか？
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleNo}
            className="flex-1 border border-gray-300 rounded-full py-2 text-sm"
          >
            いいえ
          </button>
          <button
            type="button"
            onClick={handleYes}
            className="flex-1 rounded-full py-2 text-sm font-medium
                       border border-[var(--foreground)]"
          >
            はい（18歳以上です）
          </button>
        </div>
      </div>
    </div>
  );
}