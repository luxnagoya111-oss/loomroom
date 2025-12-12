-- =====================================================
-- File: 20251212_10_post_likes_rls.sql
-- Purpose:
--   - post_likes の RLS を安全に運用する
--   - 誰でも閲覧は可能
--   - 追加/削除は「本人の user_id のみ」可能（認証必須）
-- =====================================================

alter table public.post_likes enable row level security;

-- 既存ポリシーがあれば整理（名称が違っても事故らないように“自分の命名”で統一）
drop policy if exists post_likes__select__all__anon_authenticated on public.post_likes;
drop policy if exists post_likes__insert__own__authenticated on public.post_likes;
drop policy if exists post_likes__delete__own__authenticated on public.post_likes;
drop policy if exists "allow_select_post_likes_for_all" on public.post_likes;
drop policy if exists "allow_insert_post_likes_for_all" on public.post_likes;
drop policy if exists "allow_delete_post_likes_for_all" on public.post_likes;

-- ① SELECT: 全員OK（表示用）
create policy post_likes__select__all__anon_authenticated
on public.post_likes
for select
to anon, authenticated
using (true);

-- ② INSERT: 認証ユーザーのみ / user_id が auth.uid と一致する場合のみ
create policy post_likes__insert__own__authenticated
on public.post_likes
for insert
to authenticated
with check (user_id = auth.uid());

-- ③ DELETE: 認証ユーザーのみ / 自分のいいねだけ削除可能
create policy post_likes__delete__own__authenticated
on public.post_likes
for delete
to authenticated
using (user_id = auth.uid());