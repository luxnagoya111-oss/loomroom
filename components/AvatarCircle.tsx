// components/AvatarCircle.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

export type AvatarCircleProps = {
  /** ★ 推奨：DBと一致する正式名 */
  avatarUrl?: string | null;

  /** 互換用（既存コード救済） */
  src?: string | null;

  /** px指定。デフォルト48 */
  size?: number;

  /** 表示名（1文字目を fallback に使用） */
  displayName?: string | null;

  /** 明示 fallback（displayName より優先） */
  fallbackText?: string | null;

  /**
   * 何も無い時の最終fallback
   * - 未指定なら「空」にする（真っ白丸）
   * - どうしても出したい場合だけ "U" などを渡す
   */
  defaultFallback?: string;

  /** 代替テキスト（未指定なら装飾扱い） */
  alt?: string;

  /** 画像ロードの優先度（デフォルト: eager） */
  loading?: "eager" | "lazy";

  className?: string;
};

const AvatarCircle: React.FC<AvatarCircleProps> = ({
  avatarUrl,
  src,
  size = 48,
  displayName,
  fallbackText,
  defaultFallback = "",
  alt = "",
  loading = "eager",
  className = "",
}) => {
  const resolvedSrc = useMemo(() => {
    const v = (avatarUrl ?? src ?? "").trim();
    return v.length ? v : null;
  }, [avatarUrl, src]);

  // 画像が壊れていたらfallbackへ落とす
  const [imgOk, setImgOk] = useState(true);
  useEffect(() => {
    setImgOk(true);
  }, [resolvedSrc]);

  const fallback = useMemo(() => {
    const ft = (fallbackText ?? "").trim();
    if (ft) return ft;

    const dn = (displayName ?? "").trim();
    if (dn) return dn.charAt(0).toUpperCase();

    return (defaultFallback ?? "").trim();
  }, [fallbackText, displayName, defaultFallback]);

  const isDecorative = !alt; // alt未指定なら装飾画像扱い

  return (
    <div
      className={`avatar-circle ${className}`}
      style={{ width: size, height: size }}
      aria-hidden={isDecorative ? true : undefined}
    >
      {resolvedSrc && imgOk ? (
        <img
          src={resolvedSrc}
          alt={isDecorative ? "" : alt}
          className="avatar-circle-img"
          loading={loading}
          onError={() => setImgOk(false)}
        />
      ) : fallback ? (
        <span
          className="avatar-circle-text"
          aria-hidden={isDecorative ? true : undefined}
        >
          {fallback}
        </span>
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
          display: block;
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