// lib/handle.ts
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

/**
 * 公開表示用の簡易ハンドル（同名判別用）
 * - users.id(uuid) の先頭6文字だけ使う
 * - 表記は統一：@xxxxxx
 */
export function toPublicHandleFromUserId(userId: string | null | undefined): string | null {
  if (!isUuid(userId)) return null;
  return `@${userId.slice(0, 6)}`;
}