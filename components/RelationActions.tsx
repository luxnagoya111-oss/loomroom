// components/RelationActions.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getRelation,
  setRelation,
  toRelationFlags,
  type RelationFlags,
} from "@/lib/repositories/relationRepository";
import type { UserId } from "@/types/user";

type SmartModeProps = {
  currentUserId?: string | null;
  targetId?: string | null;
  targetLabel?: string;
};

type ControlledModeProps = {
  flags?: RelationFlags;
  onToggleFollow?: () => void | Promise<void>;
  onToggleMute?: () => void | Promise<void>;
  onToggleBlock?: () => void | Promise<void>;
  onReport?: () => void;
};

export type RelationActionsProps = SmartModeProps &
  ControlledModeProps & {
    className?: string;
  };

const DEFAULT_FLAGS: RelationFlags = {
  following: false,
  muted: false,
  blocked: false,
};

export const RelationActions: React.FC<RelationActionsProps> = (props) => {
  const {
    currentUserId = null,
    targetId = null,
    targetLabel = "このアカウント",

    flags,
    onToggleFollow,
    onToggleMute,
    onToggleBlock,
    onReport,

    className,
  } = props;

  const isControlled =
    !!flags && !!onToggleFollow && !!onToggleMute && !!onToggleBlock;

  const shouldHideSmart =
    !isControlled && !!currentUserId && !!targetId && currentUserId === targetId;

  const isSmart = !isControlled && currentUserId !== null && targetId !== null;

  const [internalFlags, setInternalFlags] = useState<RelationFlags>(
    flags ?? DEFAULT_FLAGS
  );
  const [menuOpen, setMenuOpen] = useState(false);

  // 連打対策（Smartモードの通信ロック）
  const [busy, setBusy] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);

  const effectiveFlags: RelationFlags = useMemo(() => {
    return isControlled ? (flags as RelationFlags) : internalFlags;
  }, [isControlled, flags, internalFlags]);

  // smart モードでの初期ロード
  useEffect(() => {
    if (!isSmart) return;
    if (!currentUserId || !targetId || shouldHideSmart) return;

    let cancelled = false;

    (async () => {
      const row = await getRelation(currentUserId as UserId, targetId as UserId);
      if (cancelled) return;
      setInternalFlags(toRelationFlags(row));
    })();

    return () => {
      cancelled = true;
    };
  }, [isSmart, currentUserId, targetId, shouldHideSmart]);

  const applyInternalFlags = (next: Partial<RelationFlags>) => {
    setInternalFlags((prev) => ({ ...prev, ...next }));
  };

  // menu UX: 外側クリック / ESC で閉じる（menuOpen のときだけ）
  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      const root = menuRef.current;
      if (!root) return;

      const t = e.target as Node | null;
      if (!t) return;

      if (!root.contains(t)) setMenuOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener(
        "pointerdown",
        onPointerDown,
        { capture: true } as any
      );
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // smart モードで「自分自身」または ID 不足なら非表示
  if (!isControlled && (!isSmart || shouldHideSmart)) {
    return null;
  }

  const wrapperClass = ["relation-actions-row", className]
    .filter(Boolean)
    .join(" ");

  // ------------------------------
  // Smartモード：楽観更新＋ロック付き
  // ------------------------------
  const runSmartUpdate = async (next: RelationFlags, type: "follow" | "mute" | "block" | null) => {
    if (!isSmart || !currentUserId || !targetId || shouldHideSmart) return;

    // 連打ガード（「押したのに無視」体感を減らす）
    if (busy) return;

    const prev = effectiveFlags;
    // 先にUI反映（押した瞬間に変わる）
    setBusy(true);
    setInternalFlags(next);

    try {
      const ok = await setRelation({
        userId: currentUserId as UserId,
        targetId: targetId as UserId,
        type,
      });
      if (!ok) {
        // 失敗時は戻す
        setInternalFlags(prev);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleFollowClick = async () => {
    if (isControlled) {
      await onToggleFollow?.();
      return;
    }

    const nextEnabled = !effectiveFlags.following;
    const next: RelationFlags = {
      following: nextEnabled,
      muted: false,
      blocked: false,
    };

    await runSmartUpdate(next, nextEnabled ? "follow" : null);
  };

  const handleMuteClick = async () => {
    if (isControlled) {
      await onToggleMute?.();
      return;
    }

    const nextEnabled = !effectiveFlags.muted;
    const next: RelationFlags = {
      following: false,
      muted: nextEnabled,
      blocked: false,
    };

    await runSmartUpdate(next, nextEnabled ? "mute" : null);
  };

  const handleBlockClick = async () => {
    if (isControlled) {
      await onToggleBlock?.();
      return;
    }

    const nextEnabled = !effectiveFlags.blocked;

    if (nextEnabled) {
      const okConfirm = window.confirm(
        `${targetLabel}をブロックしますか？\nタイムラインやDMからも非表示になります。`
      );
      if (!okConfirm) return;
    }

    const next: RelationFlags = {
      following: false,
      muted: false,
      blocked: nextEnabled,
    };

    await runSmartUpdate(next, nextEnabled ? "block" : null);
  };

  const handleReportClick = () => {
    if (onReport) {
      onReport();
      return;
    }
    alert("このプロフィールの通報を受け付けました（現在はテスト用です）。");
  };

  return (
    <div className={wrapperClass} aria-busy={busy}>
      <div className="relation-main-actions">
        <button
          type="button"
          className={
            effectiveFlags.following
              ? "follow-button follow-button--active"
              : "follow-button"
          }
          onClick={handleFollowClick}
          disabled={!isControlled && busy}
        >
          {effectiveFlags.following ? "フォロー中" : "フォロー"}
        </button>
      </div>

      <div className="relation-more" ref={menuRef}>
        <button
          type="button"
          className="relation-more-btn"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((prev) => !prev);
          }}
          aria-label="その他の操作"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          disabled={!isControlled && busy}
        >
          ⋯
        </button>

        {menuOpen && (
          <div
            className="relation-more-menu"
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="relation-menu-item"
              onClick={async () => {
                await handleMuteClick();
                setMenuOpen(false);
              }}
              role="menuitem"
              disabled={!isControlled && busy}
            >
              {effectiveFlags.muted ? "ミュートを解除" : "ミュートする"}
            </button>

            <button
              type="button"
              className="relation-menu-item relation-menu-item--danger"
              onClick={async () => {
                await handleBlockClick();
                setMenuOpen(false);
              }}
              role="menuitem"
              disabled={!isControlled && busy}
            >
              {effectiveFlags.blocked ? "ブロックを解除" : "ブロックする"}
            </button>

            <button
              type="button"
              className="relation-menu-item relation-menu-item--danger"
              onClick={() => {
                handleReportClick();
                setMenuOpen(false);
              }}
              role="menuitem"
              disabled={!isControlled && busy}
            >
              通報する
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .relation-actions-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 8px;
        }

        .relation-main-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        /* モバイルのタップ最適化（体感改善の定番） */
        button {
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }

        .follow-button {
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: #fff;
          color: var(--text-main, #171717);
          padding: 9px 14px; /* ヒット領域を少し広げる */
          min-height: 34px;
          border-radius: 999px;
          font-size: 12px;
          cursor: pointer;
          user-select: none;
        }

        .follow-button--active {
          background: rgba(0, 0, 0, 0.06);
          border-color: rgba(0, 0, 0, 0.14);
        }

        .follow-button:disabled {
          opacity: 0.55;
          cursor: default;
        }

        .relation-more {
          margin-left: auto;
          position: relative;
        }

        .relation-more-btn {
          border: none;
          background: transparent;
          padding: 8px 10px; /* ここもヒット領域拡大 */
          min-height: 34px;
          min-width: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: var(--text-sub, #777777);
          cursor: pointer;
          user-select: none;
        }

        .relation-more-btn:disabled {
          opacity: 0.55;
          cursor: default;
        }

        .relation-more-menu {
          position: absolute;
          right: 0;
          top: 34px;
          background: #fff;
          border-radius: 10px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.16);
          padding: 6px 0;
          z-index: 20;
          min-width: 160px;
          border: 1px solid rgba(0, 0, 0, 0.06);
        }

        .relation-menu-item {
          background: transparent;
          border: none;
          font-size: 12px;
          padding: 10px 12px;
          width: 100%;
          text-align: left;
          cursor: pointer;
          color: var(--text-main, #171717);
          user-select: none;
        }

        .relation-menu-item:hover {
          background: rgba(0, 0, 0, 0.04);
        }

        .relation-menu-item--danger {
          color: #b00020;
        }

        .relation-menu-item--danger:hover {
          background: rgba(176, 0, 32, 0.06);
        }

        .relation-menu-item:disabled {
          opacity: 0.55;
          cursor: default;
        }
      `}</style>
    </div>
  );
};