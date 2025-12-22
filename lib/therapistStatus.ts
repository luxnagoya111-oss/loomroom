// lib/therapistStatus.ts
// セラピストの所属状態を扱うヘルパー
//
// ⚠️ 注意：
// - これは「UI / フロント制御専用」の暫定実装
// - 権限・投稿・DMの最終判定には必ず DB / RLS / RPC を使うこと
// - localStorage 前提のため、サーバー実行時は常に active 扱いとする

import type { UserId } from "@/types/user";
import { inferRoleFromId } from "@/types/user";
import type { TherapistStatus } from "@/lib/dmPolicy";

// v2 以降では破棄 or 再設計前提
const KEY_PREFIX = "loomroom_therapist_status_v1_";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * 指定ユーザーのセラピスト所属状態を取得
 *
 * 仕様：
 * - therapist 以外のロールは制御対象外のため常に "active"
 * - 未保存の場合も "active" 扱い
 * - サーバー実行時は localStorage が無いため "active" を返す
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
 * セラピスト所属状態を保存
 *
 * 用途：
 * - 管理者操作
 * - 退店・凍結などの UI 表示制御
 *
 * ※ DB状態の代替ではない
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