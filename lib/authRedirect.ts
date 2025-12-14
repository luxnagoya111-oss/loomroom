export function getAuthRedirectTo(path = "/auth/confirm") {
  if (typeof window !== "undefined") {
    return `${window.location.origin}${path}`;
  }
  // サーバー側フォールバック（本番優先）
  return `https://lroom.jp${path}`;
}