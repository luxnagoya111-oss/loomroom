// lib/adminConfig.ts
export const ADMIN_RP_NAME = "LRoom Admin";
export const ADMIN_RP_ID =
  process.env.ADMIN_RP_ID || "lroom.jp"; // 本番ドメイン（サブドメインならそれに合わせる）
export const ADMIN_ORIGIN =
  process.env.ADMIN_ORIGIN || "https://lroom.jp"; // 本番 origin

// Passkey登録を許可する管理者（最初はあなた1人固定が安全）
// 例：あなたのGoogleログインemailを入れる
export const ADMIN_EMAIL_ALLOWLIST = (
  process.env.ADMIN_EMAIL_ALLOWLIST || ""
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// セッション
export const ADMIN_SESSION_COOKIE = "lroom_admin_session";
export const ADMIN_SESSION_TTL_DAYS = 14;
export const ADMIN_STEPUP_TTL_MINUTES = 5;