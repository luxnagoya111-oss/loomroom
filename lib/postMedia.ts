// lib/postMedia.ts
import { supabase } from "@/lib/supabaseClient";

function isProbablyHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function normalizeUrl(v: any): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

/**
 * avatars bucket
 */
const AVATAR_BUCKET = "avatars";

/**
 * avatar_url が
 * - https://... ならそのまま
 * - それ以外（storage path）なら public URL に変換
 */
export function resolveAvatarUrl(raw: string | null | undefined): string | null {
  const v = normalizeUrl(raw);
  if (!v) return null;
  if (isProbablyHttpUrl(v)) return v;

  const path = v.startsWith(`${AVATAR_BUCKET}/`)
    ? v.slice(AVATAR_BUCKET.length + 1)
    : v;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

/**
 * post-images bucket
 */
const POST_IMAGES_BUCKET = "post-images";

/**
 * raw を string[] にゆるく正規化（揺れ吸収）
 */
export function toStringArrayLoose(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    return s ? [s] : [];
  }
  return [];
}

/**
 * ★ row から「画像元」を最優先順で拾う（DB揺れ吸収）
 * - 正：image_paths（text[] / path配列）
 * - 互換：image_urls（配列/文字列）
 * - 互換：imageUrls / imageUrl / image_path
 */
export function pickRawPostImages(row: any): unknown {
  return (
    row?.image_paths ??
    row?.image_urls ??
    row?.imageUrls ??
    row?.imageUrl ??
    row?.image_path ??
    null
  );
}

/**
 * 投稿画像を「表示用 public URL 配列」に正規化
 * - http(s) はそのまま
 * - storage path は post-images の public URL に変換
 * - "post-images/xxx" のような値でも耐える
 * - 最大4枚
 */
export function resolvePostImageUrls(raw: unknown): string[] {
  const arr = toStringArrayLoose(raw);
  const out: string[] = [];

  for (const v of arr) {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) continue;

    if (isProbablyHttpUrl(s)) {
      out.push(s);
      if (out.length >= 4) break;
      continue;
    }

    const path = s.startsWith(`${POST_IMAGES_BUCKET}/`)
      ? s.slice(POST_IMAGES_BUCKET.length + 1)
      : s;

    const { data } = supabase.storage.from(POST_IMAGES_BUCKET).getPublicUrl(path);
    const url = data?.publicUrl ?? "";

    if (url && isProbablyHttpUrl(url)) {
      out.push(url);
      if (out.length >= 4) break;
    }
  }

  return out;
}