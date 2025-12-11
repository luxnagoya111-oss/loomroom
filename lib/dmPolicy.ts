// lib/dmPolicy.ts
// DM・投稿まわりのロール別ポリシー

import type { Role } from "@/types/user";

/**
 * セラピストの所属状態
 * - active: 店舗所属あり
 * - unaffiliated: 無所属（退店など）
 */
export type TherapistStatus = "active" | "unaffiliated";

/**
 * DM送信可否判定
 *
 * 仕様 6.0 より：
 * - 一般 → セラピスト: 常に OK
 * - セラピスト → 一般: 返信のときだけ OK（最初の一通は NG）
 * - 一般 → 一般: NG
 * - ゲスト: 全て NG
 * - 店舗: 初期フェーズでは一旦 OK（必要に応じてあとで絞る）
 *
 * 無所属セラピストによる禁止（12.1）は別途 TherapistStatus で判定する想定。
 */
export function canSendDm(
  fromRole: Role,
  toRole: Role,
  isReply: boolean
): boolean {
  // ゲストはそもそも DM 不可
  if (fromRole === "guest") return false;

  // 一般 → セラピスト は常に OK
  if (fromRole === "user" && toRole === "therapist") {
    return true;
  }

  // セラピスト → 一般 は「返信のときだけ」OK
  if (fromRole === "therapist" && toRole === "user") {
    return isReply;
  }

  // 一般 → 一般 は初期フェーズでは NG
  if (fromRole === "user" && toRole === "user") {
    return false;
  }

  // 店舗アカウントは一旦なんでも OK（後で細かく制御）
  if (fromRole === "store") {
    return true;
  }

  // それ以外の組み合わせは安全側で NG
  return false;
}

/**
 * 投稿可否判定
 *
 * 仕様 13 ＋ 12.2 より：
 * - 一般ユーザー: 投稿 OK
 * - 店舗アカウント: 投稿 OK
 * - セラピスト（active）: 投稿 OK
 * - セラピスト（unaffiliated）: 投稿 NG
 * - ゲスト: NG
 */
export function canSendPost(
  role: Role,
  therapistStatus: TherapistStatus = "active"
): boolean {
  if (role === "therapist") {
    return therapistStatus === "active";
  }

  if (role === "user" || role === "store") {
    return true;
  }

  // guest などは NG
  return false;
}