// app/compose/page.tsx
"use client";

import React, {
  useEffect,
  useMemo,
  useState,
  ChangeEvent,
  FormEvent,
} from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { getCurrentUserId, getCurrentUserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

// Supabase users テーブル上で「ゲスト用」に1行だけ作っておく想定
const GUEST_DB_USER_ID = "00000000-0000-0000-0000-000000000000";

const MAX_LENGTH = 280;

// ===== 画像制限（v1）=====
const POST_IMAGES_BUCKET = "post-images";
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

// therapists テーブルの最低限の行型
type DbTherapistRowForStatus = {
  id: string;
  user_id: string;
  store_id: string | null;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

type SelectedImage = {
  file: File;
  previewUrl: string;
  error: string | null;
};

function extFromMime(file: File): "jpg" | "png" | "webp" {
  // mime を正として ext を確定（安全）
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg"; // jpeg もここ
}

function buildSafeImagePath(userId: string, index: number, file: File): string {
  // userId/ts_index.ext
  const ext = extFromMime(file);
  return `${userId}/${Date.now()}_${index}.${ext}`;
}

async function safeRemoveUploadedPaths(paths: string[]) {
  if (!paths.length) return;
  try {
    const { error } = await supabase.storage
      .from(POST_IMAGES_BUCKET)
      .remove(paths);
    if (error) {
      console.warn("[post-images.remove] error:", error);
    }
  } catch (e) {
    console.warn("[post-images.remove] exception:", e);
  }
}

export default function ComposePage() {
  const logicalUserId = getCurrentUserId(); // "guest-xxxxx" or UUID
  const currentRole = getCurrentUserRole(); // "user" | "therapist" | "store" | "guest"

  const hasUnread = false;

  // 「投稿可能か」の状態をここで一元管理
  const [canPost, setCanPost] = useState<boolean>(true);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(
    currentRole === "therapist"
  );

  const [text, setText] = useState("");

  // まだDBカラムを作っていない前提：UIだけ残す
  const [visibility, setVisibility] = useState<"public" | "limited">("public");
  const [canReply, setCanReply] = useState(true);

  const [submitting, setSubmitting] = useState(false);

  // ===== 画像UI state =====
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);

  const isGuestLogical =
    typeof logicalUserId === "string" && logicalUserId.startsWith("guest-");
  const viewerUuid = useMemo(
    () => (isUuid(logicalUserId) ? logicalUserId : null),
    [logicalUserId]
  );

  const canUseImages = useMemo(() => {
    // 画像はログインユーザーのみ（uuid必須）
    return !!viewerUuid && !isGuestLogical;
  }, [viewerUuid, isGuestLogical]);

  // ロールに応じて投稿可否を決定（既存）
  useEffect(() => {
    // セラピスト以外（user / store / guest）は今のところ制限なし
    if (currentRole !== "therapist") {
      setCanPost(true);
      setCheckingStatus(false);
      return;
    }

    if (!isUuid(logicalUserId)) {
      setCanPost(false);
      setCheckingStatus(false);
      return;
    }

    let cancelled = false;

    const checkTherapistStoreLink = async () => {
      try {
        setCheckingStatus(true);

        const { data, error } = await supabase
          .from("therapists")
          .select("id, user_id, store_id")
          .eq("user_id", logicalUserId)
          .maybeSingle<DbTherapistRowForStatus>();

        if (cancelled) return;

        if (error) {
          console.error("[Compose] failed to load therapist status:", error);
          setCanPost(false);
          return;
        }

        if (!data) {
          setCanPost(false);
          return;
        }

        setCanPost(!!data.store_id);
      } catch (e) {
        if (!cancelled) {
          console.error("[Compose] therapist status check exception:", e);
          setCanPost(false);
        }
      } finally {
        if (!cancelled) {
          setCheckingStatus(false);
        }
      }
    };

    void checkTherapistStoreLink();

    return () => {
      cancelled = true;
    };
  }, [currentRole, logicalUserId]);

  // プレビューURL破棄
  useEffect(() => {
    return () => {
      images.forEach((img) => {
        try {
          URL.revokeObjectURL(img.previewUrl);
        } catch {}
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChangeText = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    if (next.length <= MAX_LENGTH) {
      setText(next);
    }
  };

  const validateFiles = (files: File[], existingCount: number) => {
    const next: SelectedImage[] = [];
    let globalError: string | null = null;

    const remainingSlots = MAX_IMAGES - existingCount;
    const sliced = files.slice(0, Math.max(0, remainingSlots));

    if (files.length > remainingSlots) {
      globalError = `画像は最大${MAX_IMAGES}枚までです。`;
    }

    sliced.forEach((file) => {
      let err: string | null = null;

      if (!ALLOWED_MIME.has(file.type)) {
        err = "対応していない形式です（jpeg/png/webpのみ）。";
      } else if (file.size > MAX_IMAGE_BYTES) {
        err = "容量が大きすぎます（1枚5MB以下）。";
      } else if (!file.name) {
        err = "ファイル名が不正です。";
      }

      const previewUrl = URL.createObjectURL(file);
      next.push({ file, previewUrl, error: err });
    });

    return { next, globalError };
  };

  const handlePickImages = (e: ChangeEvent<HTMLInputElement>) => {
    setImageError(null);

    if (!canUseImages) {
      setImageError("画像はログイン後に追加できます。");
      e.target.value = "";
      return;
    }

    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const { next, globalError } = validateFiles(files, images.length);

    // 個別エラーがある場合も「追加はする」が、送信時に弾く（差し替えしやすい）
    setImages((prev) => [...prev, ...next]);
    if (globalError) setImageError(globalError);

    e.target.value = "";
  };

  const removeImageAt = (idx: number) => {
    setImages((prev) => {
      const target = prev[idx];
      if (target?.previewUrl) {
        try {
          URL.revokeObjectURL(target.previewUrl);
        } catch {}
      }
      const next = prev.slice();
      next.splice(idx, 1);
      return next;
    });
  };

  const hasInvalidImages = useMemo(() => {
    return images.some((img) => !!img.error);
  }, [images]);

  const uploadImagesIfAny = async (uploaderUserId: string): Promise<string[]> => {
    if (!images.length) return [];

    if (images.length > MAX_IMAGES) {
      throw new Error(`画像は最大${MAX_IMAGES}枚までです。`);
    }

    const invalid = images.find((img) => !!img.error);
    if (invalid) {
      throw new Error(invalid.error || "画像に問題があります。差し替えてください。");
    }

    const uploadedPaths: string[] = [];

    for (let i = 0; i < images.length; i++) {
      const file = images[i].file;
      const path = buildSafeImagePath(uploaderUserId, i, file);

      const { error } = await supabase.storage
        .from(POST_IMAGES_BUCKET)
        .upload(path, file, {
          upsert: false,
          contentType: file.type,
        });

      if (error) {
        console.error("[post-images.upload] error:", error);

        // 途中までアップロードされていたら掃除してから投げる
        await safeRemoveUploadedPaths(uploadedPaths);

        throw new Error(
          (error as any)?.message ?? "画像アップロードに失敗しました。"
        );
      }

      uploadedPaths.push(path);
    }

    return uploadedPaths;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const body = text.trim();
    if (!body && images.length === 0) {
      alert("本文か画像のどちらかを追加してください。");
      return;
    }

    if (!canPost) {
      alert("現在、所属店舗が無いため投稿はできません。");
      return;
    }

    // 画像はログインユーザーのみ
    if (images.length > 0 && !canUseImages) {
      alert("画像はログイン後に投稿できます。");
      return;
    }

    // Supabase 上の author_id に使う ID を決める
    const authorId = isGuestLogical ? GUEST_DB_USER_ID : logicalUserId;

    // author_kind は role ベース（guest は user 扱い）
    const authorKind =
      currentRole === "therapist" ||
      currentRole === "store" ||
      currentRole === "user"
        ? currentRole
        : "user";

    let uploadedPaths: string[] = [];

    try {
      setSubmitting(true);

      // 1) 画像があるなら upload（ログインユーザーのみ）
      if (images.length > 0) {
        if (!viewerUuid) {
          throw new Error("画像投稿にはログインが必要です。");
        }
        uploadedPaths = await uploadImagesIfAny(viewerUuid);
      }

      // 2) 投稿 insert（DBの正は image_paths）
      const { error } = await supabase.from("posts").insert([
        {
          body,
          author_id: authorId,
          author_kind: authorKind,
          image_paths: uploadedPaths.length ? uploadedPaths : [],
          // NOTE: visibility/can_reply をDBに入れるなら後で復帰
          // visibility,
          // can_reply: canReply,
        },
      ]);

      if (error) {
        console.error("Supabase insert error:", error);

        // 投稿作成に失敗したので、アップロード済み画像を掃除
        if (uploadedPaths.length) {
          await safeRemoveUploadedPaths(uploadedPaths);
        }

        alert(
          (error as any)?.message ??
            "投稿の保存中にエラーが発生しました。時間をおいて再度お試しください。"
        );
        return;
      }

      alert("投稿を公開しました。ホームのタイムラインに反映されます。");

      setText("");
      setImages((prev) => {
        prev.forEach((img) => {
          try {
            URL.revokeObjectURL(img.previewUrl);
          } catch {}
        });
        return [];
      });
      setImageError(null);

      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    } catch (err: any) {
      console.error("Compose submit error:", err);

      // 例外系でも、アップロードだけ成功していたら掃除しておく
      if (uploadedPaths.length) {
        await safeRemoveUploadedPaths(uploadedPaths);
      }

      alert(
        err?.message ??
          "予期せぬエラーが発生しました。時間をおいて再度お試しください。"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const remaining = MAX_LENGTH - text.length;

  return (
    <div className="app-root">
      <AppHeader title="投稿を作成" />

      <main className="app-main compose-main">
        {/* セラピストで、所属なしのときの案内 */}
        {currentRole === "therapist" && !checkingStatus && !canPost && (
          <div className="compose-block">
            <p className="compose-block-title">
              現在、所属店舗が無いため、投稿機能はご利用いただけません。
            </p>
            <p className="compose-block-text">
              店舗に所属してから、またここでの発信を再開できます。
            </p>
          </div>
        )}

        {/* ステータス判定中 */}
        {currentRole === "therapist" && checkingStatus && (
          <div className="compose-block">
            <p className="compose-block-title">投稿可否を確認しています…</p>
            <p className="compose-block-text">
              少しだけお待ちください。通信状況によって数秒かかることがあります。
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* 投稿テキスト */}
          <div className="compose-card">
            <textarea
              className="compose-textarea"
              value={text}
              onChange={handleChangeText}
              placeholder="いまの気持ちや、残しておきたいことを自由に書いてください"
            />

            {/* 画像ピッカー（ログインのみ） */}
            <div className="compose-image-panel">
              <div className="compose-image-row">
                <label
                  className={`compose-image-btn ${
                    !canUseImages ? "disabled" : ""
                  }`}
                >
                  画像を追加（最大4枚）
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handlePickImages}
                    disabled={!canUseImages || submitting || checkingStatus}
                    style={{ display: "none" }}
                  />
                </label>

                {!canUseImages && (
                  <div className="compose-image-note">
                    画像はログイン後に追加できます。
                  </div>
                )}
              </div>

              {imageError && (
                <div className="compose-image-error">{imageError}</div>
              )}

              {images.length > 0 && (
                <div className="compose-image-grid">
                  {images.map((img, idx) => (
                    <div key={idx} className="compose-image-item">
                      <div className="compose-image-thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.previewUrl} alt={`selected-${idx}`} />
                      </div>

                      <div className="compose-image-meta">
                        <div
                          className="compose-image-name"
                          title={img.file.name}
                        >
                          {img.file.name}
                        </div>
                        <div className="compose-image-sub">
                          {(img.file.size / 1024 / 1024).toFixed(2)}MB
                        </div>
                        {img.error && (
                          <div className="compose-image-warn">{img.error}</div>
                        )}
                      </div>

                      <button
                        type="button"
                        className="compose-image-remove"
                        onClick={() => removeImageAt(idx)}
                        aria-label="画像を削除"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {images.length > 0 && (
                <div className="compose-image-hint">
                  制限：最大4枚 / 1枚5MB以下 / jpeg・png・webp
                </div>
              )}
            </div>

            <div className="compose-footer">
              <span className="compose-count">{remaining}</span>

              <button
                type="submit"
                className="compose-submit"
                disabled={
                  submitting ||
                  checkingStatus ||
                  (!text.trim() && images.length === 0) ||
                  hasInvalidImages
                }
              >
                {submitting ? "送信中…" : "投稿する"}
              </button>
            </div>
          </div>

          {/* 公開範囲・返信可否設定（現状はUIのみ） */}
          <div className="compose-card compose-settings">
            <div className="compose-setting-row">
              <div className="compose-setting-label">公開範囲</div>
              <div className="compose-setting-control compose-visibility-toggle">
                <button
                  type="button"
                  className={
                    visibility === "public"
                      ? "toggle-pill toggle-pill--active"
                      : "toggle-pill"
                  }
                  onClick={() => setVisibility("public")}
                >
                  みんなに公開
                </button>

                <button
                  type="button"
                  className={
                    visibility === "limited"
                      ? "toggle-pill toggle-pill--active"
                      : "toggle-pill"
                  }
                  onClick={() => setVisibility("limited")}
                >
                  一部だけ
                </button>
              </div>
            </div>

            <div className="compose-setting-row">
              <div className="compose-setting-label">返信</div>
              <div className="compose-setting-control">
                <label className="compose-checkbox-label">
                  <input
                    type="checkbox"
                    checked={canReply}
                    onChange={(e) => setCanReply(e.target.checked)}
                  />
                  <span>この投稿への返信を許可する</span>
                </label>
              </div>
            </div>
          </div>

          {hasInvalidImages && (
            <div className="compose-block" style={{ marginTop: 12 }}>
              <p className="compose-block-title">画像に問題があります</p>
              <p className="compose-block-text">
                容量や形式の条件を満たす画像に差し替えてください（jpeg/png/webp、1枚5MB以下）。
              </p>
            </div>
          )}
        </form>
      </main>

      <BottomNav active="compose" hasUnread={hasUnread} />

      <style jsx>{`
        .compose-main {
          padding: 12px 16px 140px;
        }

        .compose-card {
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--surface);
          padding: 12px 12px 8px;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
          margin-top: 12px;
        }

        .compose-textarea {
          width: 100%;
          min-height: 120px;
          border: none;
          outline: none;
          resize: none;
          background: transparent;
          font-size: 14px;
          line-height: 1.6;
        }

        .compose-image-panel {
          margin-top: 10px;
          border-top: 1px solid rgba(0, 0, 0, 0.06);
          padding-top: 10px;
        }

        .compose-image-row {
          display: flex;
          align-items: center;
          gap: 10px;
          justify-content: space-between;
        }

        .compose-image-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid var(--border);
          padding: 6px 12px;
          font-size: 12px;
          background: #fff;
          cursor: pointer;
          user-select: none;
          white-space: nowrap;
        }

        .compose-image-btn.disabled {
          opacity: 0.5;
          cursor: default;
        }

        .compose-image-note {
          font-size: 11px;
          color: var(--text-sub);
          text-align: right;
        }

        .compose-image-error {
          margin-top: 8px;
          font-size: 12px;
          color: #b00020;
        }

        .compose-image-grid {
          margin-top: 10px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }

        .compose-image-item {
          position: relative;
          display: flex;
          gap: 10px;
          border-radius: 14px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: #fff;
          padding: 8px;
        }

        .compose-image-thumb {
          width: 72px;
          height: 72px;
          border-radius: 12px;
          overflow: hidden;
          flex: 0 0 72px;
          background: rgba(0, 0, 0, 0.04);
        }

        .compose-image-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .compose-image-meta {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .compose-image-name {
          font-size: 12px;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .compose-image-sub {
          font-size: 11px;
          color: var(--text-sub);
        }

        .compose-image-warn {
          margin-top: 4px;
          font-size: 11px;
          color: #b00020;
        }

        .compose-image-remove {
          position: absolute;
          top: 6px;
          right: 6px;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: #fff;
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .compose-image-hint {
          margin-top: 8px;
          font-size: 11px;
          color: var(--text-sub);
        }

        .compose-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-top: 10px;
        }

        .compose-count {
          font-size: 11px;
          color: var(--text-sub);
        }

        .compose-submit {
          border-radius: 999px;
          border: none;
          padding: 6px 14px;
          font-size: 13px;
          font-weight: 500;
          background: var(--accent);
          color: #fff;
          box-shadow: 0 2px 6px rgba(215, 185, 118, 0.45);
          cursor: pointer;
        }

        .compose-submit:disabled {
          opacity: 0.5;
          cursor: default;
        }

        .compose-settings {
          margin-top: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .compose-setting-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .compose-setting-label {
          font-size: 13px;
          color: var(--text-sub);
          flex-shrink: 0;
        }

        .compose-setting-control {
          flex: 1;
          display: flex;
          justify-content: flex-end;
          align-items: center;
        }

        .compose-visibility-toggle {
          gap: 6px;
        }

        .toggle-pill {
          border-radius: 999px;
          border: 1px solid var(--border);
          padding: 4px 10px;
          font-size: 12px;
          background: #fff;
          cursor: pointer;
        }

        .toggle-pill--active {
          background: var(--accent);
          color: #fff;
          border-color: var(--accent);
        }

        .compose-checkbox-label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-sub);
        }

        .compose-block {
          margin-top: 24px;
          padding: 20px 16px;
          border-radius: 16px;
          background: var(--surface);
          border: 1px solid var(--border);
        }

        .compose-block-title {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .compose-block-text {
          font-size: 13px;
          color: var(--muted-foreground);
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}