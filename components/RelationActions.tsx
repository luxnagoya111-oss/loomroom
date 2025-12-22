// components/RelationActions.tsx
"use client";

import React, { useEffect, useState } from "react";
import {
  getRelation,
  setRelation,
  toRelationFlags,
  type RelationFlags,
} from "@/lib/repositories/relationRepository";
import type { UserId } from "@/types/user";

type SmartModeProps = {
  /** Supabase で relations を扱うとき用 */
  currentUserId?: string | null;
  targetId?: string | null;
  /**
   * ブロック確認ダイアログで使うラベル
   * 例）"このアカウント" / "この店舗アカウント"
   */
  targetLabel?: string;
};

type ControlledModeProps = {
  /** 旧コンポーネント互換：外側で state を持っている場合 */
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
    // smart モード用
    currentUserId = null,
    targetId = null,
    targetLabel = "このアカウント",

    // controlled モード用
    flags,
    onToggleFollow,
    onToggleMute,
    onToggleBlock,
    onReport,

    className,
  } = props;

  // 「旧：外から flags / handler を渡すか？」でモード判定
  const isControlled =
    !!flags && !!onToggleFollow && !!onToggleMute && !!onToggleBlock; // report は任意

  // smart モードかつ自分自身なら非表示
  const shouldHideSmart =
    !isControlled && !!currentUserId && !!targetId && currentUserId === targetId; // 自分宛なら出さない

  // smart モードかどうか（currentUserId/targetId が渡っている）
  const isSmart = !isControlled && currentUserId !== null && targetId !== null;

  // 内部 state（smart モード時のみ使う）
  const [internalFlags, setInternalFlags] = useState<RelationFlags>(
    flags ?? DEFAULT_FLAGS
  );
  const [menuOpen, setMenuOpen] = useState(false);

  // ★ 外側クリック/Escで閉じるためのref
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  // 画面に表示するフラグ
  const effectiveFlags: RelationFlags = isControlled
    ? (flags as RelationFlags)
    : internalFlags;

  // smart モードでの初期ロード（Supabase → flags）
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

  // ==============================
  // menu UX: 外側クリック / ESC で閉じる
  // ==============================
  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      const root = menuRef.current;
      if (!root) return;

      const target = e.target as Node | null;
      if (!target) return;

      if (!root.contains(target)) setMenuOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown, { capture: true } as any);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // ==============================
  // クリックハンドラ
  // ==============================

  const handleFollowClick = async () => {
    // 旧：外から渡すモード
    if (isControlled) {
      await onToggleFollow?.();
      return;
    }

    // smart モードでなければ何もしない
    if (!isSmart || !currentUserId || !targetId || shouldHideSmart) return;

    const nextEnabled = !effectiveFlags.following;
    const ok = await setRelation({
      userId: currentUserId as UserId,
      targetId: targetId as UserId,
      type: nextEnabled ? "follow" : null,
    });
    if (!ok) return;

    // follow を ON にしたら他はオフにする（1種類だけルール）
    applyInternalFlags({
      following: nextEnabled,
      muted: false,
      blocked: false,
    });
  };

  const handleMuteClick = async () => {
    if (isControlled) {
      await onToggleMute?.();
      return;
    }

    if (!isSmart || !currentUserId || !targetId || shouldHideSmart) return;

    const nextEnabled = !effectiveFlags.muted;
    const ok = await setRelation({
      userId: currentUserId as UserId,
      targetId: targetId as UserId,
      type: nextEnabled ? "mute" : null,
    });
    if (!ok) return;

    applyInternalFlags({
      following: false,
      muted: nextEnabled,
      blocked: false,
    });
  };

  const handleBlockClick = async () => {
    if (isControlled) {
      await onToggleBlock?.();
      return;
    }

    if (!isSmart || !currentUserId || !targetId || shouldHideSmart) return;

    const nextEnabled = !effectiveFlags.blocked;

    if (nextEnabled) {
      const okConfirm = window.confirm(
        `${targetLabel}をブロックしますか？\nタイムラインやDMからも非表示になります。`
      );
      if (!okConfirm) return;
    }

    const ok = await setRelation({
      userId: currentUserId as UserId,
      targetId: targetId as UserId,
      type: nextEnabled ? "block" : null,
    });
    if (!ok) return;

    applyInternalFlags({
      following: false,
      muted: false,
      blocked: nextEnabled,
    });
  };

  const handleReportClick = () => {
    if (onReport) {
      onReport();
      return;
    }
    // デフォルト（テスト用）
    alert("このプロフィールの通報を受け付けました（現在はテスト用です）。");
  };

  // smart モードで「自分自身」または ID 不足なら非表示
  if (!isControlled && (!isSmart || shouldHideSmart)) {
    return null;
  }

  const wrapperClass = ["relation-actions-row", className].filter(Boolean).join(" ");

  return (
    <div className={wrapperClass}>
      {/* メイン：フォローだけ表示 */}
      <div className="relation-main-actions">
        <button
          type="button"
          className={
            effectiveFlags.following
              ? "follow-button follow-button--active"
              : "follow-button"
          }
          onClick={handleFollowClick}
        >
          {effectiveFlags.following ? "フォロー中" : "フォロー"}
        </button>
      </div>

      {/* ・・・メニュー（ミュート／ブロック／通報） */}
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
              onClick={() => {
                handleMuteClick();
                setMenuOpen(false);
              }}
              role="menuitem"
            >
              {effectiveFlags.muted ? "ミュートを解除" : "ミュートする"}
            </button>

            <button
              type="button"
              className="relation-report-btn"
              onClick={() => {
                handleBlockClick();
                setMenuOpen(false);
              }}
              role="menuitem"
            >
              {effectiveFlags.blocked ? "ブロックを解除" : "ブロックする"}
            </button>

            <button
              type="button"
              className="relation-report-btn"
              onClick={() => {
                handleReportClick();
                setMenuOpen(false);
              }}
              role="menuitem"
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

        .follow-button {
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: #fff;
          color: var(--text-main, #171717);
          padding: 7px 12px;
          border-radius: 999px;
          font-size: 12px;
          cursor: pointer;
        }

        .follow-button--active {
          background: rgba(0, 0, 0, 0.06);
          border-color: rgba(0, 0, 0, 0.14);
        }

        .relation-more {
          margin-left: auto;
          position: relative;
        }

        .relation-more-btn {
          border: none;
          background: transparent;
          padding: 2px 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: var(--text-sub, #777777);
          cursor: pointer;
        }

        .relation-more-menu {
          position: absolute;
          right: 0;
          top: 18px;
          background: #fff;
          border-radius: 10px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.16);
          padding: 6px 0;
          z-index: 20;
          min-width: 160px;
          border: 1px solid rgba(0, 0, 0, 0.06);
        }

        .relation-menu-item,
        .relation-report-btn {
          background: transparent;
          border: none;
          font-size: 12px;
          padding: 8px 12px;
          width: 100%;
          text-align: left;
          cursor: pointer;
          color: var(--text-main, #171717);
        }

        .relation-menu-item:hover {
          background: rgba(0, 0, 0, 0.04);
        }

        .relation-report-btn {
          color: #b00020;
        }

        .relation-report-btn:hover {
          background: rgba(176, 0, 32, 0.06);
        }
      `}</style>
    </div>
  );
};