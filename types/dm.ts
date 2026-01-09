// types/dm.ts

import type { UserId } from "@/types/user";

// 1つのスレッドを識別するID
export type ThreadId = string;

// スレッド本体（2ユーザー視点）
export type DMThread = {
  threadId: ThreadId;

  // threadIdの構成要素（viewer/partnerの並びではなく、常に固定順）
  userAId: UserId;
  userBId: UserId;

  lastMessage: string;      // 空文字になり得る
  lastMessageAt: string;    // ISO文字列（空文字になり得る）

  // 未読は「未設定なら0扱い」を許容（後方互換・安全側）
  unreadForA?: number;
  unreadForB?: number;
};

// 1件のメッセージ
export type DMMessage = {
  id: string;
  threadId: ThreadId;
  fromUserId: UserId;
  text: string;
  createdAt: string; // ISO文字列
};

// 「あるユーザー視点」で見たときのスレッド一覧用の型
export type DMThreadForUser = {
  threadId: ThreadId;
  partnerId: UserId;
  partnerName: string;
  partnerAvatarUrl?: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
};