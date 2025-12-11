// components/AvatarCircle.tsx
"use client";

import React from "react";

type AvatarCircleProps = {
  /** 画像URL（なければ白丸＋テキスト） */
  src?: string | null;
  /** px指定。デフォルト48 */
  size?: number;
  /** 表示名（1文字目を fallbackText に自動変換） */
  displayName?: string;
  /** 画像が無いときに真ん中に出すテキスト */
  fallbackText?: string;
};

const AvatarCircle: React.FC<AvatarCircleProps> = ({
  src,
  size = 48,
  displayName,
  fallbackText,
}) => {
  // displayName があれば、fallbackText が空でも自動で1文字抽出
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
      {src ? (
        <img src={src} alt="" className="avatar-circle-img" />
      ) : resolvedFallback ? (
        <span className="avatar-circle-text">{resolvedFallback}</span>
      ) : null}
    </div>
  );
};

export default AvatarCircle;