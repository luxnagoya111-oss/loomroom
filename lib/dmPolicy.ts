// lib/dmPolicy.ts
// DM・投稿まわりのロール別ポリシー（LoomRoom 正式版）

import type { Role } from "@/types/user";

/**
 * セラピストの所属状態
 * - active: 店舗所属あり
 * - unaffiliated: 無所属（退店・未所属）
 */
export type TherapistStatus = "active" | "unaffiliated";

/**
 * DM送信可否判定
 *
 * 設計思想（重要）：
 * - isReply === true は「既に関係が成立している」ことを意味する
 * - 既存スレッド内の返信は、原則ロールを問わず許可（※ブロック等は別）
 * - 新規DM開始のみをロールで厳密に制御する
 *
 * ※ 無所属セラピスト制限は UI / Page 側で判定する（ここでは扱わない）
 */
export function canSendDm(
  fromRole: Role,
  toRole: Role,
  isReply: boolean
): boolean {
  // -----------------------------
  // 0. ゲストは常に不可
  // -----------------------------
  if (fromRole === "guest") return false;

  // -----------------------------
  // 1. 返信（既存スレッド）
  // -----------------------------
  // 返信は原則すべて許可
  //（ブロック・所属制限・RLSは別レイヤー）
  if (isReply) {
    return true;
  }

  // -----------------------------
  // 2. 新規DM開始ルール
  // -----------------------------

  // 一般ユーザー → セラピスト：OK
  if (fromRole === "user" && toRole === "therapist") {
    return true;
  }

  // セラピスト → 一般ユーザー：新規はNG（返信のみ）
  if (fromRole === "therapist" && toRole === "user") {
    return false;
  }

  // セラピスト → 店舗：業務連絡としてOK
  if (fromRole === "therapist" && toRole === "store") {
    return true;
  }

  // 店舗 → 全ロール：初期フェーズではOK
  if (fromRole === "store") {
    return true;
  }

  // 一般 → 一般：NG
  if (fromRole === "user" && toRole === "user") {
    return false;
  }

  // その他は安全側でNG
  return false;
}

/**
 * 投稿可否判定
 *
 * 仕様：
 * - 一般ユーザー: OK
 * - 店舗: OK
 * - セラピスト（active）: OK
 * - セラピスト（unaffiliated）: NG
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

  // guest 等
  return false;
}