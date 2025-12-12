-- =====================================================
-- File: 20251212_20_dm_send_message_rpc.sql
-- Purpose:
--   - DM送信をRPCで一括処理（メッセージinsert + thread更新 + 未読加算）
--   - from_user_id は auth.uid() に固定
--   - thread参加者チェックを必須化
-- =====================================================

create or replace function public.dm_send_message(
  p_thread_id     uuid,
  p_text          text,
  p_sent_at       timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_a uuid;
  v_user_b uuid;
  v_to_user uuid;
  v_now timestamptz := coalesce(p_sent_at, now());
begin
  -- 0) 認証必須
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- 1) thread存在 & 参加者チェック（★ thread_id 列に合わせる）
  select user_a_id, user_b_id
    into v_user_a, v_user_b
  from public.dm_threads
  where thread_id = p_thread_id;

  if v_user_a is null then
    raise exception 'thread not found';
  end if;

  if auth.uid() <> v_user_a and auth.uid() <> v_user_b then
    raise exception 'not a participant of this thread';
  end if;

  -- 2) 宛先（相手）を thread から推定（p_to_user_id 不要）
  v_to_user := case when auth.uid() = v_user_a then v_user_b else v_user_a end;

  -- 3) メッセージ挿入
  insert into public.dm_messages (thread_id, from_user_id, text, created_at)
  values (p_thread_id, auth.uid(), p_text, v_now);

  -- 4) thread更新（プレビュー + 未読加算）
  update public.dm_threads
  set
    last_message    = p_text,
    last_message_at = v_now,
    unread_for_a    = case when v_to_user = v_user_a then coalesce(unread_for_a, 0) + 1 else coalesce(unread_for_a, 0) end,
    unread_for_b    = case when v_to_user = v_user_b then coalesce(unread_for_b, 0) + 1 else coalesce(unread_for_b, 0) end
  where thread_id = p_thread_id;

end;
$$;

-- 実行権限（必要に応じて）
revoke all on function public.dm_send_message(uuid, text, timestamptz) from public;
grant execute on function public.dm_send_message(uuid, text, timestamptz) to authenticated