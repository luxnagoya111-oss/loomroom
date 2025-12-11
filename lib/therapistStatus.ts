// lib/therapistStatus.ts
// セラピストの所属状態を扱うヘルパー（暫定版：localStorage）

import type { UserId } from "@/types/user";
import { inferRoleFromId } from "@/types/user";
import type { TherapistStatus } from "@/lib/dmPolicy";

const KEY_PREFIX = "loomroom_therapist_status_v1_";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * 指定ユーザーのセラピスト状態を取得
 * - therapist 以外のロールに対しては常に "active" を返す（制御対象外）
 * - 保存されていなければ "active" 扱い
 */
export function getTherapistStatus(userId: UserId): TherapistStatus {
  if (!isBrowser()) return "active";

  const role = inferRoleFromId(userId);
  if (role !== "therapist") {
    return "active";
  }

  const key = KEY_PREFIX + userId;
  const raw = window.localStorage.getItem(key);

  if (raw === "unaffiliated") {
    return "unaffiliated";
  }

  return "active";
}

/**
 * セラピスト状態を保存
 * - 今は dev / 管理者用を想定
 *   （将来、退店処理などから呼ぶ想定）
 */
export function setTherapistStatus(
  userId: UserId,
  status: TherapistStatus
): void {
  if (!isBrowser()) return;

  const role = inferRoleFromId(userId);
  if (role !== "therapist") return;

  const key = KEY_PREFIX + userId;
  window.localStorage.setItem(key, status);
}