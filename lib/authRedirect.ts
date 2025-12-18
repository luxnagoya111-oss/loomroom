// lib/authRedirect.ts

export function getAuthRedirectTo(path = "/auth/confirm") {
  const p = path.startsWith("/") ? path : `/${path}`;

  // ブラウザ（最優先）
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${p}`;
  }

  // サーバー側フォールバック（環境で切替）
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  return `${base.replace(/\/+$/, "")}${p}`;
}