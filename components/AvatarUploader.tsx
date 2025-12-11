"use client";

import React, { useRef } from "react";

type Props = {
  avatarDataUrl?: string;         // 表示用URL（Base64 or Storage URL）
  displayName?: string;           // 頭文字
  onChange?: (dataUrl: string) => void;      // ※従来の Base64 コールバック（後方互換）
  onFileSelect?: (file: File) => void;       // ★新規：Storage アップロード用
};

const AvatarUploader: React.FC<Props> = ({
  avatarDataUrl,
  displayName,
  onChange,
  onFileSelect,
}) => {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleClick = () => {
    fileRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      // 5MB 制限（Storage 前提なので少し緩め）
      alert("画像サイズが大きすぎます（5MB以下推奨）");
      return;
    }

    // ① Storage アップロード用：File を親へ渡す
    if (onFileSelect) {
      onFileSelect(file);
    }

    // ② 従来の Base64 コールバックも維持（互換性のため）
    if (onChange) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          onChange(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const avatarStyle: React.CSSProperties = avatarDataUrl
    ? {
        backgroundImage: `url(${avatarDataUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "#ddd",
      }
    : {
        backgroundColor: "#ddd",
      };

  const initial =
    displayName?.trim()?.charAt(0)?.toUpperCase() ?? "U";

  return (
    <>
      <button
        type="button"
        className="tc-avatar"
        onClick={handleClick}
      >
        <div className="tc-avatar-inner" style={avatarStyle}>
          {!avatarDataUrl && (
            <span className="tc-avatar-initial">{initial}</span>
          )}
        </div>
        <span className="tc-avatar-hint">アイコン変更</span>
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleChange}
      />

      <style jsx>{`
        .tc-avatar {
          border: none;
          background: transparent;
          padding: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          cursor: pointer;
        }

        .tc-avatar-inner {
          width: 60px;
          height: 60px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ddd;
          overflow: hidden;
        }

        .tc-avatar-initial {
          font-size: 24px;
          font-weight: 600;
          color: #555;
        }

        .tc-avatar-hint {
          font-size: 11px;
          color: var(--text-sub);
        }
      `}</style>
    </>
  );
};

export default AvatarUploader;