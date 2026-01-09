// lib/authRedirect.ts
const DEFAULT_SITE_URL = "https://lroom.jp";

/**
 * NEXT_PUBLIC_SITE_URL を env ごとに設定する:
 * - ローカル: http://localhost:3000
 * - 本番:     https://lroom.jp
 */
export function getSiteUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
}

export function getAuthRedirectTo(path = "/auth/confirm") {
  return `${getSiteUrl()}${path}`;
}