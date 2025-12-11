// types/dm.ts

// 1つのスレッドを識別するID
export type ThreadId = string;

// スレッド本体（2ユーザー視点）
// - dmStorage.ts や lib/data/messages.ts から利用される
export type DMThread = {
  threadId: ThreadId;
  userAId: string;
  userBId: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadForA: number;
  unreadForB: number;
};

// 1件のメッセージ
export type DMMessage = {
  id: string;
  threadId: ThreadId;
  fromUserId: string;
  text: string;
  createdAt: string; // ISO文字列
};

// 「あるユーザー視点」で見たときのスレッド一覧用の型
// - lib/data/messages.ts の getThreadsForUser() がこの形で返す
export type DMThreadForUser = {
  threadId: ThreadId;
  partnerId: string;
  partnerName: string;
  partnerAvatarUrl?: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
};