// lib/avatarStorage.ts
// Supabase Storage に avatar をアップロードし、公開URLを返す共通モジュール

import { supabase } from "@/lib/supabaseClient";

/**
 * Storage 内の保存パスを作成する
 * 例:
 *   users/{userId}/avatar_20250101-123045.jpg
 */
function buildAvatarPath(userId: string, file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const timestamp = new Date()
    .toISOString()
    .replace(/[:-]/g, "")
    .replace(/\..+/, "")
    .replace("T", "-"); // 20250101-123000 みたいな形に整形

  return `users/${userId}/avatar_${timestamp}.${ext}`;
}

/**
 * Storage にアップロードし、その公開URLを返す
 *
 * @param file - <input type="file"> で取得した File
 * @param userId - Auth.uid() または users.id
 *
 * @returns avatar_url（公開URL）
 */
export async function uploadAvatar(
  file: File,
  userId: string
): Promise<string> {
  const path = buildAvatarPath(userId, file);

  // Storage にアップロード
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) {
    console.error("[uploadAvatar] Upload error:", uploadError);
    throw new Error("画像のアップロードに失敗しました。");
  }

  // 公開URLを生成
  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  return publicUrl;
}