-- =====================================================
-- File: 20251212_22_dm_messages_rls.sql
-- Purpose:
--   - dm_messages: 参加者のみ閲覧可
--   - 書き込みはRPC(dm_send_message)のみ（直insertは禁止）
-- =====================================================

alter table public.dm_messages enable row level security;

-- 既存ポリシー整理（実行済みの命名があるなら追加でdrop）
drop policy if exists dm_messages__select__own_threads__authenticated on public.dm_messages;
drop policy if exists "dm_messages_select_own_threads" on public.dm_messages;
drop policy if exists "dm_messages_insert_own" on public.dm_messages;

-- 1) select：自分が参加しているスレッドのメッセージだけ読める
create policy dm_messages__select__own_threads__authenticated
on public.dm_messages
for select
to authenticated
using (
  exists (
    select 1
      from public.dm_threads t
     where t.thread_id = dm_messages.thread_id
       and auth.uid() in (t.user_a_id, t.user_b_id)
  )
);

-- insert policy は作らない（= RLSにより拒否される）