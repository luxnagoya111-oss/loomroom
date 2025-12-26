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

  // 既定はスクロールバー出さない
  el.style.overflowY = "hidden";

  // 視覚的な上限（maxRows）
  const lh = parseFloat(getComputedStyle(el).lineHeight || "18") || 18;
  const maxH = lh * maxRows + 10;

  if (el.scrollHeight > maxH) {
    el.style.height = `${maxH}px`;
    el.style.overflowY = "auto"; // ★5行超えたら中でスクロール
  }
}

export default function ComposerBar({
  value,
  onChange,
  onSend,
  placeholder = "メッセージを入力...",
  disabled = false,
  sending = false,

  // ★ Enter送信はNG：デフォルト false
  sendOnEnter = false,

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
    // sendOnEnter=false のときは何もしない（Enter=改行）
    if (!sendOnEnter) return;

    // sendOnEnter=true のときだけ Enter 送信 / Shift+Enter 改行
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

      <style jsx global>{`
        .chat-input-bar {
          position: fixed;
          left: 50%;
          transform: translateX(-50%);
          width: 100%;
          padding: 6px 10px 10px;
          background: transparent;
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
          padding: 7px 0 5px 12px;
          height: auto;
          overflow-y: hidden;
          white-space: pre-wrap;
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