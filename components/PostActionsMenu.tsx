// components/PostActionsMenu.tsx
"use client";

import React, { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  onToggle: () => void;

  // owner なら削除、それ以外なら通報
  isOwner: boolean;

  viewerReady: boolean;

  // actions
  onDelete?: () => void | Promise<void>;
  onReport?: () => void | Promise<void>;

  // optional labels
  deleteLabel?: string; // default: "削除する"
  reportLabel?: string; // default: "通報する"

  // optional: 外側クリック/ESC で閉じたい場合（通常 true 想定）
  closeOnOutsideClick?: boolean; // default: true
  closeOnEscape?: boolean; // default: true
};

export default function PostActionsMenu(props: Props) {
  const {
    open,
    onToggle,
    isOwner,
    viewerReady,
    onDelete,
    onReport,
    deleteLabel = "削除する",
    reportLabel = "通報する",
    closeOnOutsideClick = true,
    closeOnEscape = true,
  } = props;

  const rootRef = useRef<HTMLDivElement | null>(null);

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return;
    if (!closeOnOutsideClick) return;

    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;

      const target = e.target as Node | null;
      if (!target) return;

      // メニュー領域外なら閉じる
      if (!root.contains(target)) onToggle();
    };

    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, { capture: true } as any);
    };
  }, [open, closeOnOutsideClick, onToggle]);

  // ESC で閉じる
  useEffect(() => {
    if (!open) return;
    if (!closeOnEscape) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onToggle();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeOnEscape, onToggle]);

  return (
    <div className="post-more-wrapper" ref={rootRef}>
      <button
        type="button"
        className="post-more-btn"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label="投稿メニュー"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⋯
      </button>

      {open && (
        <div
          className="post-more-menu"
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          {isOwner ? (
            <button
              type="button"
              className="post-danger-btn"
              disabled={!viewerReady}
              onClick={async () => {
                if (!viewerReady) return;
                try {
                  await onDelete?.();
                } finally {
                  // 成否に関わらず閉じる
                  onToggle();
                }
              }}
              role="menuitem"
            >
              {deleteLabel}
            </button>
          ) : (
            <button
              type="button"
              className="post-danger-btn"
              disabled={!viewerReady}
              onClick={async () => {
                if (!viewerReady) return;
                try {
                  await onReport?.();
                } finally {
                  // 成否に関わらず閉じる
                  onToggle();
                }
              }}
              role="menuitem"
            >
              {reportLabel}
            </button>
          )}
        </div>
      )}

      <style jsx>{`
        .post-more-wrapper {
          margin-left: auto;
          position: relative;
        }

        .post-more-btn {
          border: none;
          background: transparent;
          padding: 2px 4px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--text-sub, #777777);
          cursor: pointer;
        }

        .post-more-menu {
          position: absolute;
          right: 0;
          top: 18px;
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.16);
          padding: 4px 0;
          z-index: 10;
          min-width: 140px;
        }

        .post-danger-btn {
          background: transparent;
          border: none;
          font-size: 12px;
          padding: 6px 12px;
          width: 100%;
          text-align: left;
          color: #b00020;
          cursor: pointer;
        }

        .post-danger-btn:hover {
          background: rgba(176, 0, 32, 0.06);
        }

        .post-danger-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}