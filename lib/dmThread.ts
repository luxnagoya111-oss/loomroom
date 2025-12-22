// lib/dmThread.ts
// DM の threadId 周りの共通ロジック（ソース・オブ・トゥルース）
//
// 推奨仕様（新）:
//  - threadId = sort([myUserId, partnerUserId]).join("|")
//  - 例: uuidA | uuidB → "uuidA|uuidB"（順序は常に固定）
//
// 後方互換（旧）:
//  - "_" 区切りの threadId も parseThreadId() で読み取れる
//  - ただし旧仕様は ID に "_" を含むと復元不能になり得るため、新規生成には使わない
//

import type { DMThread } from "@/types/dm";
import type { UserId } from "@/types/user";

const THREAD_SEP_NEW = "|";
const THREAD_SEP_OLD = "_";

/**
 * 文字列比較を常に安定させる（locale依存を避ける）
 */
function stableCompare(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * 2人のユーザーIDから threadId を作る（新方式）
 * 並び順は安定ソートして固定（誰が押しても同じ ID）
 */
export function makeThreadId(userIdA: UserId, userIdB: UserId): string {
  const a = String(userIdA);
  const b = String(userIdB);
  const [x, y] = [a, b].sort(stableCompare);
  return `${x}${THREAD_SEP_NEW}${y}`;
}

/**
 * threadId を (userAId, userBId) に戻す（後方互換あり）
 *
 * 対応フォーマット:
 * - 新: "xxx|yyy"
 * - 旧: "xxx_yyy"
 *
 * 注意:
 * - 旧 "_" 区切りは ID 内に "_" が含まれると分割が壊れる。
 *   そのため、旧を読むときは「最後の _ で 2分割」を採用し、破壊範囲を最小化する。
 */
export function parseThreadId(threadId: string): [UserId, UserId] {
  const s = String(threadId || "");

  // 1) 新方式 "|" を優先
  if (s.includes(THREAD_SEP_NEW)) {
    const parts = s.split(THREAD_SEP_NEW);
    const left = (parts[0] ?? "") as UserId;
    const right = (parts.slice(1).join(THREAD_SEP_NEW) ?? "") as UserId; // 念のため
    return [left, right];
  }

  // 2) 旧方式 "_" は「最後の _」で2分割（ID内 "_" 混入の破壊を軽減）
  const idx = s.lastIndexOf(THREAD_SEP_OLD);
  if (idx >= 0) {
    const left = (s.slice(0, idx) ?? "") as UserId;
    const right = (s.slice(idx + 1) ?? "") as UserId;
    return [left, right];
  }

  // 3) 想定外フォーマット
  if (s) return [s as UserId, "" as UserId];
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
 * - なければ 0 を返す。
 */
export function getUnreadCount(thread: DMThread, currentUserId: UserId): number {
  if (thread.userAId === currentUserId) return thread.unreadForA ?? 0;
  if (thread.userBId === currentUserId) return thread.unreadForB ?? 0;
  return 0;
}

/**
 * 互換用：threadId が「新方式か」を判定
 */
export function isNewThreadIdFormat(threadId: string): boolean {
  return String(threadId || "").includes(THREAD_SEP_NEW);
}

/**
 * 互換用：2つのIDから「旧方式threadId」も生成（移行確認・参照用）
 * ※新規作成には使わない
 */
export function makeLegacyThreadId(userIdA: UserId, userIdB: UserId): string {
  const a = String(userIdA);
  const b = String(userIdB);
  const [x, y] = [a, b].sort(stableCompare);
  return `${x}${THREAD_SEP_OLD}${y}`;
}