// lib/avatarStorage.ts
// Supabase Storage に avatar をアップロードし、公開URLを返す共通モジュール

import { supabase } from "@/lib/supabaseClient";

const BUCKET = "avatars";

function extFromFile(file: File) {
  const name = file.name || "";
  const m = name.match(/\.([a-zA-Z0-9]+)$/);
  if (m?.[1]) return m[1].toLowerCase();

  // mime fallback
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpg";
}

/**
 * Storage 内の保存パスを作成する
 * 例:
 *   avatars/{ownerId}/avatar_1734367890123.jpg
 *
 * ※ prefix を "users/" にすると概念が混ざるので、ここは ownerId 直下に統一推奨
 */
function buildAvatarPath(ownerId: string, file: File): string {
  const ext = extFromFile(file);
  return `${ownerId}/avatar_${Date.now()}.${ext}`;
}

/**
 * Storage にアップロードし、その公開URLを返す
 *
 * @param file - <input type="file"> で取得した File
 * @param ownerId - therapists.id / users.id など、あなたが “このアイコンの所有者” として管理するID
 *
 * @returns publicUrl（短い公開URL）
 */
export async function uploadAvatar(file: File, ownerId: string): Promise<string> {
  if (!ownerId) throw new Error("ownerId is required.");
  if (!file) throw new Error("file is required.");

  // ★未ログインだとRLSで落ちるので先に判定（原因が分かりやすい）
  const { data: authRes, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  if (!authRes?.user) {
    throw new Error("ログインが必要です。再ログインしてからお試しください。");
  }

  const path = buildAvatarPath(ownerId, file);

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false, // timestamp付きで毎回別パスなので false 推奨
    contentType: file.type || undefined,
  });

  if (uploadError) {
    console.error("[uploadAvatar] Upload error:", uploadError);
    // 42501 の場合は Storage RLS が原因
    throw new Error("画像のアップロードに失敗しました。");
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = pub?.publicUrl;

  if (!publicUrl) {
    throw new Error("公開URLの生成に失敗しました。");
  }

  return publicUrl;
}