// lib/data/messages.ts
import { DMMessage, DMThread, DMThreadForUser, ThreadId } from "@/types/dm";
import type { UserId } from "@/types/user";
import { makeThreadId } from "@/lib/dmThread";

// デモ用のインメモリDB（本番ではDBに差し替え想定）
let messages: DMMessage[] = [];
let threads: DMThread[] = [];

// 簡易プロフィール（API側で partnerName / avatar を解決する用）
type Profile = {
  displayName: string;
  avatarUrl?: string;
};

const USER_PROFILES: Record<UserId, Profile> = {
  // ここは必要に応じて増やす
  guest: { displayName: "ゲスト" },
  taki: { displayName: "TAKI" },
  hiyori: { displayName: "HIYORI" },
  lux: { displayName: "LuX nagoya" },
  loomroom: { displayName: "LoomRoom" },
};

// プロフィール取得（なければIDをそのまま名前にする）
function getProfile(userId: UserId): Profile {
  const p = USER_PROFILES[userId];
  if (p) return p;
  return { displayName: userId };
}

// threadId→DMThread を取得 or 作成
function getOrCreateThread(threadId: ThreadId, fromUserId: UserId): DMThread {
  let t = threads.find((th) => th.threadId === threadId);
  if (t) return t;

  // makeThreadId と同じ仕様で userA / userB を決める
  const [a, b] = threadId.split("_") as [UserId, UserId] | [UserId];

  let userAId: UserId;
  let userBId: UserId;

  if (b) {
    // "a_b" 形式
    userAId = a;
    userBId = b;
  } else {
    // 片側だけ来た場合は fromUserId と組み合わせておく（保険）
    const sorted = [fromUserId, a].sort();
    userAId = sorted[0];
    userBId = sorted[1];
  }

  t = {
    threadId: makeThreadId(userAId, userBId),
    userAId,
    userBId,
    lastMessage: "",
    lastMessageAt: new Date(0).toISOString(),
    unreadForA: 0,
    unreadForB: 0,
  };

  threads.push(t);
  return t;
}

// ============ 公開API ============

export function getMessagesForThreadId(threadId: ThreadId): DMMessage[] {
  return messages
    .filter((m) => m.threadId === threadId)
    .sort((a, b) => {
      const at = new Date(a.createdAt).getTime();
      const bt = new Date(b.createdAt).getTime();
      return at - bt;
    });
}

export function addMessage(
  threadId: ThreadId,
  fromUserId: UserId,
  text: string
): DMMessage {
  const now = new Date();
  const createdAt = now.toISOString();

  const msg: DMMessage = {
    id: `${threadId}_${now.getTime()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    threadId,
    fromUserId,
    text,
    createdAt,
  };

  messages.push(msg);

  // スレッド更新
  const t = getOrCreateThread(threadId, fromUserId);
  t.lastMessage = text;
  t.lastMessageAt = createdAt;

  // 未読カウント更新（送信者以外の片側だけ増やすシンプル仕様）
  if (fromUserId === t.userAId) {
    t.unreadForB = (t.unreadForB ?? 0) + 1;
  } else if (fromUserId === t.userBId) {
    t.unreadForA = (t.unreadForA ?? 0) + 1;
  }

  return msg;
}

// 「特定ユーザー視点」でのスレッド一覧
export function getThreadsForUser(userId: UserId): DMThreadForUser[] {
  const list = threads.filter(
    (t) => t.userAId === userId || t.userBId === userId
  );

  return list
    .map<DMThreadForUser>((t) => {
      const isA = t.userAId === userId;
      const partnerId: UserId = isA ? t.userBId : t.userAId;
      const profile = getProfile(partnerId);

      const unreadCount = isA ? t.unreadForA ?? 0 : t.unreadForB ?? 0;

      return {
        threadId: t.threadId,
        partnerId,
        partnerName: profile.displayName,
        partnerAvatarUrl: profile.avatarUrl,
        lastMessage: t.lastMessage,
        lastMessageAt: t.lastMessageAt,
        unreadCount,
      };
    })
    .sort((a, b) => {
      const at = new Date(a.lastMessageAt).getTime();
      const bt = new Date(b.lastMessageAt).getTime();
      return bt - at;
    });
}

// （必要なら）テスト用リセット関数
export function _resetDmData() {
  messages = [];
  threads = [];
}