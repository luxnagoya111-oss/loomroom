// components/ComposerBar.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";

type Props = {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void | Promise<void>;

  placeholder?: string;

  disabled?: boolean;
  sending?: boolean;

  /** Enter送信 / Shift+Enter改行 */
  sendOnEnter?: boolean;

  /** 既存の見た目（messages）を維持するための調整 */
  bottomOffset?: number; // BottomNav の高さ（既定 70）
  maxWidth?: number; // 既定 430

  /** posts 側で focus したい場合用 */
  textareaId?: string;
};

function autosizeTextarea(el: HTMLTextAreaElement, maxRows = 5) {
  // いったん縮めて scrollHeight を正しく測る
  el.style.height = "0px";

  const next = el.scrollHeight;
  el.style.height = `${next}px`;

  // スクロールバーは通常出さない（必要なら auto に切り替える余地は残す）
  el.style.overflowY = "hidden";

  // 視覚的な上限（maxRows）
  const lh = parseFloat(getComputedStyle(el).lineHeight || "18") || 18;
  const maxH = lh * maxRows + 10;
  if (el.scrollHeight > maxH) {
    el.style.height = `${maxH}px`;
    el.style.overflowY = "auto";
  }
}

export default function ComposerBar({
  value,
  onChange,
  onSend,
  placeholder = "メッセージを入力...",
  disabled = false,
  sending = false,
  sendOnEnter = true,
  bottomOffset = 70,
  maxWidth = 430,
  textareaId,
}: Props) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const canSend = useMemo(() => {
    return !disabled && !sending && !!value.trim();
  }, [disabled, sending, value]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    autosizeTextarea(el, 5);
  }, [value]);

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (!sendOnEnter) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!canSend) return;
      void onSend();
    }
  };

  return (
    <>
      <div
        className="chat-input-bar"
        style={{
          bottom: `${bottomOffset}px`,
          maxWidth: `${maxWidth}px`,
        }}
      >
        <div className="chat-input-inner">
          <textarea
            id={textareaId}
            ref={inputRef}
            className="chat-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={disabled}
          />
          <button
            type="button"
            className="chat-send-btn"
            onClick={() => void onSend()}
            disabled={!canSend}
          >
            {sending ? "送信中…" : "送信"}
          </button>
        </div>
      </div>

      {/* ★ messages のCSSをここに集約（global前提のUIを維持） */}
      <style jsx global>{`
        .chat-input-bar {
          position: fixed;
          left: 50%;
          transform: translateX(-50%);
          width: 100%;
          padding: 6px 10px 10px;
          background: linear-gradient(
            to top,
            rgba(253, 251, 247, 0.96),
            rgba(253, 251, 247, 0.78),
            transparent
          );
          box-sizing: border-box;
          z-index: 40;
        }

        .chat-input-inner {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          border-radius: 20px;
          background: var(--surface);
          border: 1px solid var(--border);
          padding: 6px 8px 6px 12px;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.03);
        }

        .chat-input {
          flex: 1;
          border: none;
          background: transparent;
          resize: none;
          font-size: 13px;
          line-height: 1.4;
          padding: 7px 0 5px 12px; /* 上 右 下 左 */
          height: auto; /* JSがheightを入れる前提 */
          overflow-y: hidden; /* autosizeが必要ならautoに切替 */
          white-space: pre-wrap; /* 改行保持 */
        }

        .chat-input:focus {
          outline: none;
        }

        .chat-input:disabled {
          background: rgba(0, 0, 0, 0.03);
          color: #666;
        }

        .chat-send-btn {
          border: none;
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          background: var(--accent);
          color: #fff;
          box-shadow: 0 2px 6px rgba(215, 185, 118, 0.45);
          flex-shrink: 0;
        }

        .chat-send-btn:disabled {
          opacity: 0.5;
          cursor: default;
          box-shadow: none;
        }
      `}</style>
    </>
  );
}