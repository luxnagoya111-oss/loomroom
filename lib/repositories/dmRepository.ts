// lib/repositories/dmRepository.ts
// DM 用のサーバー側ストレージ（Supabase 正）
// - dm_threads / dm_messages
// - RPC: dm_send_message / dm_mark_thread_read

import { supabase } from "@/lib/supabaseClient";
import type { UserId } from "@/types/user";
import type { DbDmThreadRow, DbDmMessageRow } from "@/types/db";
import type { ThreadId } from "@/types/dm";

/**
 * ログインユーザーに紐づく DM スレッド一覧を取得
 */
export async function getThreadsForUser(userId: UserId): Promise<DbDmThreadRow[]> {
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
 * - single() だと「存在しない」が error になりやすいので maybeSingle()
 */
export async function getThreadById(threadId: ThreadId): Promise<DbDmThreadRow | null> {
  const { data, error } = await supabase
    .from("dm_threads")
    .select(
      "thread_id, user_a_id, user_b_id, last_message, last_message_at, unread_for_a, unread_for_b"
    )
    .eq("thread_id", threadId)
    .maybeSingle();

  if (error) {
    console.error("[dmRepository.getThreadById] Supabase error:", error);
    return null;
  }
  return (data ?? null) as DbDmThreadRow | null;
}

/**
 * threadId ごとのメッセージ一覧を取得（古い順）
 * ★ dm_messages.id が存在する前提（今回DBに追加する）
 */
export async function getMessagesForThread(threadId: ThreadId): Promise<DbDmMessageRow[]> {
  const { data, error } = await supabase
    .from("dm_messages")
    .select("id, thread_id, from_user_id, text, created_at, is_read")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[dmRepository.getMessagesForThread] Supabase error:", error);
    return [];
  }
  return (data ?? []) as DbDmMessageRow[];
}

/**
 * メッセージ送信（RPC）
 */
export async function sendMessage(params: {
  threadId: ThreadId;
  fromUserId: UserId;
  toUserId: UserId;
  text: string;
}): Promise<boolean> {
  const { threadId, fromUserId, toUserId, text } = params;
  const trimmed = (text ?? "").trim();
  if (!trimmed) return false;

  const now = new Date().toISOString();

  const { error } = await supabase.rpc("dm_send_message", {
    p_thread_id: threadId,
    p_from_user_id: fromUserId,
    p_to_user_id: toUserId,
    p_text: trimmed,
    p_sent_at: now,
  });

  if (error) {
    console.error("[dmRepository.sendMessage] Supabase error:", error);
    return false;
  }
  return true;
}

/**
 * スレッド既読化（RPC）
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