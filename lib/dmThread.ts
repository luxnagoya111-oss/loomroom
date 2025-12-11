// lib/dmThread.ts
// DM の threadId 周りの共通ロジック（ソース・オブ・トゥルース）
//
// 仕様 6.1.2 より：
//  - threadId = sort([myUserId, partnerUserId]).join("_")
//  - 例: u_123 と t_aki → ["t_aki", "u_123"] → "t_aki_u_123"

import type { DMThread } from "@/types/dm";
import type { UserId } from "@/types/user";

/**
 * 2人のユーザーIDから threadId を作る
 * 並び順は sort() して固定（誰が押しても同じ ID）
 */
export function makeThreadId(userIdA: UserId, userIdB: UserId): string {
  return [userIdA, userIdB].sort().join("_");
}

/**
 * threadId を (userAId, userBId) に戻す
 *
 * - 正常ケース: "xxx_yyy"
 * - 想定外フォーマット: そのまま分割しつつ、数が足りなければ空文字を補う
 */
export function parseThreadId(threadId: string): [UserId, UserId] {
  const parts = threadId.split("_");
  if (parts.length >= 2) {
    return [parts[0] as UserId, parts[1] as UserId];
  }
  if (parts.length === 1) {
    return [parts[0] as UserId, "" as UserId];
  }
  return ["" as UserId, "" as UserId];
}

/**
 * ログインユーザー視点で「相手のID」を取得
 * - currentUserId が userAId / userBId のどちらかである前提
 * - どちらでもない場合は null
 */
export function getPartnerIdFromThread(
  thread: DMThread,
  currentUserId: UserId
): UserId | null {
  if (thread.userAId === currentUserId) return thread.userBId;
  if (thread.userBId === currentUserId) return thread.userAId;
  return null;
}

/**
 * ログインユーザー視点での未読件数
 * - 現状は dmStorage / messages.ts で未読管理を入れる前提。
 * - なければ 0 を返す。
 */
export function getUnreadCount(
  thread: DMThread,
  currentUserId: UserId
): number {
  if (thread.userAId === currentUserId) {
    return thread.unreadForA ?? 0;
  }
  if (thread.userBId === currentUserId) {
    return thread.unreadForB ?? 0;
  }
  return 0;
}
