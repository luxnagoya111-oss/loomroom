"use client";

import React from "react";

type AvatarProps = {
  src?: string | null;       // 画像URL
  size?: number;             // サイズ(px) 指定なしなら 48
  className?: string;        // 追加class
  alt?: string;              // 代替テキスト
};

const Avatar: React.FC<AvatarProps> = ({
  src,
  size = 48,
  className = "",
  alt = "",
}) => {
  const dimension = { width: size, height: size };

  return (
    <div
      className={`lr-avatar ${className}`}
      style={{
        ...dimension,
        minWidth: size,
        minHeight: size,
      }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className="lr-avatar-img"
        />
      ) : (
        // ★画像なし：完全白丸
        <div className="lr-avatar-blank" />
      )}

      {/* コンポーネント内部のスタイル */}
      <style jsx>{`
        .lr-avatar {
          border-radius: 999px;
          overflow: hidden;
          position: relative;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .lr-avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 999px;
          display: block;
        }
        .lr-avatar-blank {
          width: 100%;
          height: 100%;
          background: #ffffff; /* 完全真っ白 */
        }
      `}</style>
    </div>
  );
};

export default Avatar;