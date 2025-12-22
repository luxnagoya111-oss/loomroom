// lib/postImageStorage.ts
import { supabase } from "@/lib/supabaseClient";

const POST_IMAGE_BUCKET = "post-images";

function extFromFile(file: File): string {
  const name = (file.name || "").toLowerCase();
  const m = name.match(/\.([a-z0-9]+)$/i);
  const ext = m?.[1] ?? "";
  if (ext && ext.length <= 5) return ext;
  // mime fallback
  const mt = (file.type || "").toLowerCase();
  if (mt.includes("png")) return "png";
  if (mt.includes("webp")) return "webp";
  if (mt.includes("jpeg") || mt.includes("jpg")) return "jpg";
  return "bin";
}

export function isProbablyHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function normalizeStoragePath(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  // もし "post-images/xxx" が来たら bucket prefix を落とす
  if (s.startsWith(`${POST_IMAGE_BUCKET}/`)) {
    return s.slice(POST_IMAGE_BUCKET.length + 1);
  }
  return s;
}

/**
 * DBに入っている値（path または http）を表示用 URL に変換
 */
export function resolvePostImageUrl(raw: string | null | undefined): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  if (isProbablyHttpUrl(s)) return s;

  const path = normalizeStoragePath(s);
  if (!path) return null;

  const { data } = supabase.storage.from(POST_IMAGE_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

/**
 * 画像をアップロードして「path（bucket無し）」を返す
 */
export async function uploadPostImage(file: File, opts: { ownerId: string }): Promise<string> {
  const ext = extFromFile(file);
  const safeOwner = (opts.ownerId || "anon").replace(/[^a-zA-Z0-9_-]/g, "");
  const key = `${safeOwner}/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;

  const { error } = await supabase.storage.from(POST_IMAGE_BUCKET).upload(key, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });

  if (error) throw error;
  return key; // DBへ保存するのは path のみ
}