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
    !!flags &&
    !!onToggleFollow &&
    !!onToggleMute &&
    !!onToggleBlock; // report は任意

  // smart モードかつ自分自身なら非表示
  const shouldHideSmart =
    !isControlled &&
    (!!currentUserId &&
      !!targetId &&
      currentUserId === targetId); // 自分宛なら出さない

  // smart モードかどうか（currentUserId/targetId が渡っている）
  const isSmart = !isControlled && currentUserId !== null && targetId !== null;

  // 内部 state（smart モード時のみ使う）
  const [internalFlags, setInternalFlags] = useState<RelationFlags>(
    flags ?? DEFAULT_FLAGS
  );
  const [menuOpen, setMenuOpen] = useState(false);

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
      const row = await getRelation(
        currentUserId as UserId,
        targetId as UserId
      );
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

  const wrapperClass = ["relation-actions-row", className]
    .filter(Boolean)
    .join(" ");

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
      <div className="relation-more">
        <button
          type="button"
          className="relation-more-btn"
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          ⋯
        </button>

        {menuOpen && (
          <div className="relation-more-menu">
            <button
              type="button"
              className="relation-menu-item"
              onClick={() => {
                handleMuteClick();
                setMenuOpen(false);
              }}
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
            >
              通報する
            </button>
          </div>
        )}
      </div>
    </div>
  );
};