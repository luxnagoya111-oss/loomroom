// components/ReplyComposer.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";

type Props = {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void | Promise<void>;

  disabled?: boolean;
  sending?: boolean;

  placeholder?: string;
  textareaId?: string;

  /** messages と同じ思想：Enter=送信 / Shift+Enter=改行 */
  sendOnEnter?: boolean;

  /** autosize 上限（messages同等：5） */
  maxRows?: number;

  /** 投稿詳細内に埋め込む前提 */
  variant?: "inline" | "fixed";
};

function autosizeTextarea(el: HTMLTextAreaElement, maxRows = 5) {
  // いったん縮めて scrollHeight を正しく測る
  el.style.height = "0px";

  const next = el.scrollHeight;
  el.style.height = `${next}px`;

  // スクロールバーは出さない（messages と同じ思想）
  el.style.overflowY = "hidden";

  // maxRows を厳密に制限したい場合は line-height 計算が必要だが、
  // messages と同じく “簡易autosize” を正とする（UX優先）
}

export default function ReplyComposer({
  value,
  onChange,
  onSend,
  disabled = false,
  sending = false,
  placeholder = "返信を書く…",
  textareaId,
  sendOnEnter = true,
  maxRows = 5,
  variant = "inline",
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const canSend = useMemo(() => {
    const t = value.trim();
    return !!t && !disabled && !sending;
  }, [value, disabled, sending]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    autosizeTextarea(el, maxRows);
  }, [value, maxRows]);

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (!sendOnEnter) return;

    // Enter=送信、Shift+Enter=改行（messages と同じ）
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!canSend) return;
      void onSend();
    }
  };

  // messages の固定バーをそのまま使うと posts 詳細で邪魔になりやすいので、
  // デフォルトは inline。fixed を使う場合のみ messages と同様にする。
  const wrapClass =
    variant === "fixed" ? "chat-input-bar" : "reply-input-inline";

  return (
    <div className={wrapClass}>
      <div className="chat-input-inner">
        <textarea
          id={textareaId}
          ref={ref}
          className="chat-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || sending}
          rows={1}
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

      {/* 重要：messages と同一の class 名を使う前提なので、最低限の見た目をここで担保。
         既に globalcss に定義がある場合でも、ほぼ同等なら競合しません。 */}
      <style jsx global>{`
        /* fixed は messages と同様にしたい時だけ使う */
        .chat-input-bar {
          position: fixed;
          left: 50%;
          transform: translateX(-50%);
          bottom: 70px;
          width: 100%;
          max-width: 430px;
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

        /* 投稿詳細内に埋め込む版（推奨） */
        .reply-input-inline {
          width: 100%;
          margin-top: 10px;
        }

        .chat-input-inner {
          display: flex;
          align-items: flex-end;
          gap: 8px;

          border: 1px solid rgba(0, 0, 0, 0.12);
          background: #fff;
          border-radius: 18px;
          padding: 10px 10px 10px 12px;

          box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
        }

        .chat-input {
          flex: 1;
          border: none;
          outline: none;
          background: transparent;

          font-size: 14px;
          line-height: 1.55;

          /* Xっぽい“左から入力が始まる”余白 */
          padding: 2px 0 2px 0;

          resize: none;
          min-height: 22px;
          max-height: 160px;
        }

        .chat-input::placeholder {
          color: rgba(0, 0, 0, 0.42);
        }

        .chat-send-btn {
          border: none;
          border-radius: 14px;
          padding: 9px 12px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;

          background: rgba(0, 0, 0, 0.9);
          color: #fff;
          -webkit-text-fill-color: #fff;
        }

        .chat-send-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}