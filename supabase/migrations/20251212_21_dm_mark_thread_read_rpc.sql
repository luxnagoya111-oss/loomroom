-- =====================================================
-- File: 20251212_21_dm_mark_thread_read_rpc.sql
-- Purpose:
--   - DMスレッドを既読にする（自分側unreadを0にする）
--   - 参加者チェック必須
-- =====================================================

create or replace function public.dm_mark_thread_read(
  p_thread_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_a uuid;
  v_user_b uuid;
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

  -- 2) 自分側の未読のみ 0 にする
  update public.dm_threads
  set
    unread_for_a = case when auth.uid() = v_user_a then 0 else unread_for_a end,
    unread_for_b = case when auth.uid() = v_user_b then 0 else unread_for_b end
  where thread_id = p_thread_id;

end;
$$;

revoke all on function public.dm_mark_thread_read(uuid) from public;
grant execute on function public.dm_mark_thread_read(uuid) to authenticated;