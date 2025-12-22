// components/AvatarUploader.tsx
"use client";

import React, { useRef, useState } from "react";

type Props = {
  /** 表示用：最終URL or プレビューdataURL */
  avatarUrl?: string | null;
  displayName?: string;
  size?: number;

  /** 画像選択直後のプレビュー(dataURL) */
  onPreview?: (dataUrl: string) => void;

  /** アップロード完了後の確定URL */
  onUploaded?: (url: string) => void;

  /**
   * 推奨：Storageアップロード + DB更新まで行い、最終URLを返す
   * 返り値のURLは「短い public URL」であること
   */
  onFileSelect?: (file: File) => Promise<string>;
};

const MAX_MB = 5;

function initialFromName(name?: string) {
  const s = (name ?? "").trim();
  return s ? s.charAt(0).toUpperCase() : "U";
}

export default function AvatarUploader({
  avatarUrl,
  displayName,
  size = 60,
  onPreview,
  onUploaded,
  onFileSelect,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const handleClick = () => {
    if (busy) return;
    fileRef.current?.click();
  };

  const readAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Invalid file result."));
      };
      reader.readAsDataURL(file);
    });

  const handleChangeInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 同じファイルを再選択できるように
    e.target.value = "";

    if (file.size > MAX_MB * 1024 * 1024) {
      alert(`画像サイズが大きすぎます（${MAX_MB}MB以下推奨）`);
      return;
    }

    // ① 即プレビュー（dataURL）
    if (onPreview) {
      try {
        const preview = await readAsDataUrl(file);
        onPreview(preview);
      } catch {
        // プレビュー失敗は無視
      }
    }

    // ② アップロード（確定URLを返す）
    if (!onFileSelect) return;

    setBusy(true);
    try {
      const finalUrl = await onFileSelect(file);
      if (finalUrl) {
        onUploaded?.(finalUrl);
      }
    } catch (err) {
      console.error("[AvatarUploader] upload failed:", err);
      alert("画像のアップロードに失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const initial = initialFromName(displayName);

  const avatarStyle: React.CSSProperties = avatarUrl
    ? {
        backgroundImage: `url(${avatarUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "#ddd",
      }
    : { backgroundColor: "#ddd" };

  return (
    <>
      <button
        type="button"
        className="tc-avatar"
        onClick={handleClick}
        disabled={busy}
      >
        <div
          className="tc-avatar-inner"
          style={{ ...avatarStyle, width: size, height: size }}
        >
          {!avatarUrl && <span className="tc-avatar-initial">{initial}</span>}
        </div>
        <span className="tc-avatar-hint">{busy ? "保存中…" : "アイコン変更"}</span>
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleChangeInput}
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
        .tc-avatar[disabled] {
          opacity: 0.7;
          cursor: default;
        }
        .tc-avatar-inner {
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
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
}