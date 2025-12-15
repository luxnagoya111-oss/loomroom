// components/AvatarCircle.tsx
"use client";

import React from "react";

export type AvatarCircleProps = {
  /** ★ 推奨：DBと一致する正式名 */
  avatarUrl?: string | null;

  /** 互換用（既存コード救済） */
  src?: string | null;

  /** px指定。デフォルト48 */
  size?: number;

  /** 表示名（1文字目を fallback に使用） */
  displayName?: string;

  /** 明示 fallback（displayName より優先） */
  fallbackText?: string;
};

const AvatarCircle: React.FC<AvatarCircleProps> = ({
  avatarUrl,
  src,
  size = 48,
  displayName,
  fallbackText,
}) => {
  // avatarUrl を優先、なければ src
  const resolvedSrc = avatarUrl ?? src ?? null;

  const resolvedFallback =
    fallbackText ??
    (displayName ? displayName.trim().charAt(0).toUpperCase() : undefined);

  return (
    <div
      className="avatar-circle"
      style={{
        width: size,
        height: size,
      }}
    >
      {resolvedSrc ? (
        <img src={resolvedSrc} alt="" className="avatar-circle-img" />
      ) : resolvedFallback ? (
        <span className="avatar-circle-text">{resolvedFallback}</span>
      ) : null}

      <style jsx>{`
        .avatar-circle {
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
        }

        .avatar-circle-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .avatar-circle-text {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-sub);
        }
      `}</style>
    </div>
  );
};

export default AvatarCircle;