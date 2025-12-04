"use client";

import React, { useRef } from "react";

type Props = {
  avatarDataUrl?: string;
  displayName?: string;
  onChange: (dataUrl: string) => void;
};

const AvatarUploader: React.FC<Props> = ({
  avatarDataUrl,
  displayName,
  onChange,
}) => {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleClick = () => {
    fileRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("画像サイズが大きすぎます（2MB以下推奨）");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onChange(reader.result);
      }
    };
    reader.readAsDataURL(file);
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

      {/* Avatar 専用スタイル（丸い枠アイコン） */}
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