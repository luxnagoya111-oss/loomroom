"use client";

import React, { useEffect, useState } from "react";

const STORAGE_KEY = "loomroom_age_confirmed_v1";

function isBrowser() {
  return typeof window !== "undefined";
}

export default function AgeGate() {
  const [isChecking, setIsChecking] = useState(true);
  const [isConfirmed, setIsConfirmed] = useState(false);

  useEffect(() => {
    if (!isBrowser()) {
      setIsChecking(false);
      return;
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "yes") setIsConfirmed(true);
    setIsChecking(false);
  }, []);

  // 未同意の間はスクロールも止める（“邪魔でOK”設計）
  useEffect(() => {
    if (!isBrowser()) return;

    const shouldLock = !isChecking && !isConfirmed;
    if (!shouldLock) return;

    const prevOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = prevOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, [isChecking, isConfirmed]);

  if (isChecking || isConfirmed) return null;

  const handleYes = () => {
    if (!isBrowser()) return;
    window.localStorage.setItem(STORAGE_KEY, "yes");
    setIsConfirmed(true);
  };

  const handleNo = () => {
    if (!isBrowser()) return;
    // 「離脱」を明確化（戻るで戻ってもまたゲート）
    window.location.href = "https://www.google.com";
  };

  return (
    <>
      {/* 背景クリックで閉じない：onClickは付けない */}
      <div className="agegate-backdrop" role="dialog" aria-modal="true">
        <div className="agegate-card" role="document">
          <div className="agegate-eyebrow">重要</div>

          <h2 className="agegate-title">18歳以上の方のみご利用いただけます</h2>

          <p className="agegate-text">
            LRoomは18歳以上の方のみを対象としたサービスです。
            <br />
            あなたは18歳以上ですか？
          </p>

          <div className="agegate-actions">
            <button
              type="button"
              onClick={handleNo}
              className="agegate-btn agegate-btn--ghost"
            >
              いいえ（退出）
            </button>

            <button
              type="button"
              onClick={handleYes}
              className="agegate-btn agegate-btn--primary"
            >
              はい（18歳以上です）
            </button>
          </div>

          <div className="agegate-note">
            「はい」を押すと、この確認は次回以降表示されません。
          </div>
        </div>
      </div>

      <style jsx>{`
        .agegate-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;

          /* “邪魔でOK” → 暗め＆少しノイズっぽい重さ */
          background: rgba(2, 6, 23, 0.68);
          backdrop-filter: blur(6px);
        }

        .agegate-card {
          width: 100%;
          max-width: 420px;
          border-radius: 18px;
          padding: 16px;

          background: rgba(255, 255, 255, 0.96);
          border: 1px solid rgba(0, 0, 0, 0.10);
          box-shadow: 0 24px 60px rgba(2, 6, 23, 0.28);
        }

        .agegate-eyebrow {
          width: fit-content;
          margin: 0 auto 8px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.2px;
          color: rgba(180, 137, 90, 0.95);
          background: rgba(217, 176, 124, 0.16);
          border: 1px solid rgba(180, 137, 90, 0.22);
          padding: 4px 10px;
          border-radius: 999px;
        }

        .agegate-title {
          margin: 0 0 10px;
          text-align: center;
          font-size: 15px;
          font-weight: 900;
          letter-spacing: 0.2px;
          color: rgba(15, 23, 42, 0.95);
        }

        .agegate-text {
          margin: 0 0 14px;
          text-align: center;
          font-size: 12px;
          line-height: 1.75;
          color: var(--text-sub, rgba(15, 23, 42, 0.72));
        }

        .agegate-actions {
          display: flex;
          gap: 10px;
        }

        .agegate-btn {
          flex: 1;
          border-radius: 999px;
          padding: 10px 12px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          border: 1px solid rgba(0, 0, 0, 0.14);
          background: #fff;
        }

        .agegate-btn--ghost {
          background: rgba(255, 255, 255, 0.80);
          color: var(--text-sub, rgba(15, 23, 42, 0.72));
        }

        .agegate-btn--primary {
          border-color: rgba(180, 137, 90, 0.55);
          background: linear-gradient(135deg, #d9b07c, #b4895a);
          color: #fff;
          box-shadow: 0 12px 24px rgba(180, 137, 90, 0.24);
        }

        .agegate-btn:active {
          transform: translateY(1px);
        }

        .agegate-note {
          margin-top: 10px;
          text-align: center;
          font-size: 10.5px;
          color: var(--text-sub, rgba(15, 23, 42, 0.60));
          line-height: 1.6;
        }
      `}</style>
    </>
  );
}