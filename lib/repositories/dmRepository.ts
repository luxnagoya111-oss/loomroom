// lib/repositories/dmRepository.ts
// DM 用のサーバー側ストレージ
// - 仕様：threadId = makeThreadId(userA, userB)

import { supabase } from "@/lib/supabaseClient";
import type { UserId } from "@/types/user";
import type { DbDmThreadRow, DbDmMessageRow } from "@/types/db";
import type { ThreadId } from "@/types/dm";

/**
 * ログインユーザーに紐づく DM スレッド一覧を取得
 */
export async function getThreadsForUser(
  userId: UserId
): Promise<DbDmThreadRow[]> {
  const { data, error } = await supabase
    .from("dm_threads")
    .select(
      "thread_id, user_a_id, user_b_id, last_message, last_message_at, unread_for_a, unread_for_b"
    )
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .order("last_message_at", { ascending: false });

  if (error) {
    console.error("[dmRepository.getThreadsForUser] Supabase error:", error);
    return [];
  }

  return (data ?? []) as DbDmThreadRow[];
}

/**
 * threadId から DM スレッド 1件を取得
 * - /messages/[threadId] ページで partnerId 判定に使用
 */
export async function getThreadById(
  threadId: ThreadId
): Promise<DbDmThreadRow | null> {
  const { data, error } = await supabase
    .from("dm_threads")
    .select(
      "thread_id, user_a_id, user_b_id, last_message, last_message_at, unread_for_a, unread_for_b"
    )
    .eq("thread_id", threadId)
    .single();

  if (error) {
    console.error("[dmRepository.getThreadById] Supabase error:", error);
    return null;
  }

  return data as DbDmThreadRow;
}

/**
 * threadId ごとのメッセージ一覧を取得（古い順）
 */
export async function getMessagesForThread(
  threadId: ThreadId
): Promise<DbDmMessageRow[]> {
  const { data, error } = await supabase
    .from("dm_messages")
    .select("id, thread_id, from_user_id, text, created_at, is_read")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(
      "[dmRepository.getMessagesForThread] Supabase error:",
      error
    );
    return [];
  }

  return (data ?? []) as DbDmMessageRow[];
}

/**
 * メッセージ送信
 * - RPC: dm_send_message を前提
 */
export async function sendMessage(params: {
  threadId: ThreadId;
  fromUserId: UserId;
  toUserId: UserId;
  text: string;
}): Promise<boolean> {
  const { threadId, fromUserId, toUserId, text } = params;

  const now = new Date().toISOString();

  const { error } = await supabase.rpc("dm_send_message", {
    p_thread_id: threadId,
    p_from_user_id: fromUserId,
    p_to_user_id: toUserId,
    p_text: text,
    p_sent_at: now,
  });

  if (error) {
    console.error("[dmRepository.sendMessage] Supabase error:", error);
    return false;
  }

  return true;
}

/**
 * スレッドを閲覧したユーザー側の未読数を0にする
 * - RPC: dm_mark_thread_read を前提
 */
export async function markThreadAsRead(params: {
  threadId: ThreadId;
  viewerId: UserId;
}): Promise<boolean> {
  const { threadId, viewerId } = params;

  const { error } = await supabase.rpc("dm_mark_thread_read", {
    p_thread_id: threadId,
    p_viewer_id: viewerId,
  });

  if (error) {
    console.error("[dmRepository.markThreadAsRead] Supabase error:", error);
    return false;
  }

  return true;
}