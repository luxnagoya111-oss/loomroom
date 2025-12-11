// lib/dmStorage.ts
// ローカルストレージ版 DM ストレージ（現行正解）
//
// - /app/messages/[id]/page.tsx から使用
// - ブラウザのみで動作（SSR では no-op）
// - threadId は lib/dmThread.makeThreadId() のルールに従う前提

import type { DMThread, DMMessage } from "@/types/dm";
import type { UserId } from "@/types/user";

const THREADS_KEY = "loomroom_dm_threads_v1";
const MSG_KEY_PREFIX = "loomroom_dm_messages_v1_";
const LAST_READ_PREFIX = "loomroom_dm_lastRead_v1_";

function isBrowser() {
  return typeof window !== "undefined";
}

// ==============================
// threads（スレ一覧）
// ==============================
function loadAllThreads(): DMThread[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(THREADS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DMThread[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (e) {
    console.warn("loadAllThreads failed:", e);
    return [];
  }
}

function saveThreads(threads: DMThread[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(THREADS_KEY, JSON.stringify(threads));
  } catch (e) {
    console.warn("saveThreads failed:", e);
  }
}

/**
 * 指定ユーザーが関係する thread 一覧を返す（将来 /messages 一覧用）
 */
export function loadThreads(userId: UserId): DMThread[] {
  const all = loadAllThreads();
  return all.filter(
    (t) => t.userAId === userId || t.userBId === userId
  );
}

// ==============================
// messages（各スレのメッセージ）
// ==============================
function msgKey(threadId: string): string {
  return `${MSG_KEY_PREFIX}${threadId}`;
}

function loadMessagesRaw(threadId: string): DMMessage[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(msgKey(threadId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DMMessage[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (e) {
    console.warn("loadMessagesRaw failed:", e);
    return [];
  }
}

function saveMessagesRaw(threadId: string, list: DMMessage[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(msgKey(threadId), JSON.stringify(list));
  } catch (e) {
    console.warn("saveMessagesRaw failed:", e);
  }
}

/**
 * /app/messages/[id]/page.tsx から使う公開関数
 */
export function loadMessagesForThread(threadId: string): DMMessage[] {
  return loadMessagesRaw(threadId);
}

/**
 * 新規メッセージを追加し、スレッドの lastMessage / lastMessageAt を更新する
 *
 * - 初回メッセージの場合は thread を新規作成（仕様 6.1.1 の「最初のメッセージで正式スレ作成」）
 * - threadId は makeThreadId() で生成されたものを前提とする
 */
export function appendMessageToThread(
  threadId: string,
  fromUserId: UserId,
  text: string
): DMMessage {
  if (!isBrowser()) {
    // SSR 防止。ブラウザ外では何もしない。
    const nowIso = new Date().toISOString();
    return {
      id: `${threadId}_dummy`,
      threadId,
      fromUserId,
      text,
      createdAt: nowIso,
    };
  }

  const nowIso = new Date().toISOString();

  // 既存メッセージを取得
  const currentMsgs = loadMessagesRaw(threadId);
  const newMessage: DMMessage = {
    id: `${threadId}_${currentMsgs.length + 1}_${Date.now()}`,
    threadId,
    fromUserId,
    text,
    createdAt: nowIso,
  };

  const nextMsgs = [...currentMsgs, newMessage];
  saveMessagesRaw(threadId, nextMsgs);

  // thread を更新 or 新規作成
  const [idA, idB] = threadId.split("_") as [UserId, UserId];
  let threads = loadAllThreads();
  const idx = threads.findIndex((t) => t.threadId === threadId);

  if (idx === -1) {
    // 新規スレ
    const newThread: DMThread = {
      threadId,
      userAId: idA,
      userBId: idB,
      lastMessage: text,
      lastMessageAt: nowIso,
      // 未読管理はフェーズ3以降で本格実装
      unreadForA: 0,
      unreadForB: 0,
    };
    threads = [newThread, ...threads];
  } else {
    const t = threads[idx];
    const updated: DMThread = {
      ...t,
      lastMessage: text,
      lastMessageAt: nowIso,
      // 未読カウントは将来ここで更新
    };
    threads = [...threads];
    threads[idx] = updated;
  }

  saveThreads(threads);

  return newMessage;
}

// ==============================
// 既読管理（ローカル版）
// ==============================
function lastReadKey(threadId: string, userId: UserId): string {
  return `${LAST_READ_PREFIX}${threadId}_${userId}`;
}

/**
 * スレッドを「自分視点で既読」にする
 * - 今はタイムスタンプを記録するだけ（未読バッジはフェーズ3で活用）
 */
export function markThreadAsRead(threadId: string, userId: UserId): void {
  if (!isBrowser()) return;
  try {
    const nowIso = new Date().toISOString();
    window.localStorage.setItem(lastReadKey(threadId, userId), nowIso);
  } catch (e) {
    console.warn("markThreadAsRead failed:", e);
  }
}

// 将来、未読数を計算したいときのためのヘルパー（今は未使用でもOK）
export function getLastReadAt(threadId: string, userId: UserId): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(lastReadKey(threadId, userId));
  } catch {
    return null;
  }
}
/**
 * 指定 thread の最後のメッセージを返す（なければ null）
 */
export function getLastMessage(threadId: string): DMMessage | null {
  const list = loadMessagesForThread(threadId);
  if (!list.length) return null;
  return list[list.length - 1];
}

/**
 * スレッドに 1件以上メッセージがあるかどうか
 */
export function hasMessages(threadId: string): boolean {
  const list = loadMessagesForThread(threadId);
  return list.length > 0;
}

/**
 * 指定スレッドが、指定ユーザーから見て未読扱いかどうか
 *
 * - 基準：lastMessage.createdAt > lastReadAt
 * - lastReadAt が null の場合 → メッセージが1件でもあれば未読扱い
 */
export function isThreadUnread(threadId: string, userId: UserId): boolean {
  const last = getLastMessage(threadId);
  if (!last) return false; // メッセージ自体がない

  const lastRead = getLastReadAt(threadId, userId);
  if (!lastRead) {
    // 一度も開いていない → 未読
    return true;
  }

  try {
    const lastReadTime = new Date(lastRead).getTime();
    const lastMsgTime = new Date(last.createdAt).getTime();
    return lastMsgTime > lastReadTime;
  } catch {
    // パースに失敗したら安全側：未読扱い
    return true;
  }
}
