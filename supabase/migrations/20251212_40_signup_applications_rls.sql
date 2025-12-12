-- =====================================================
-- File: 20251212_40_signup_applications_rls.sql
-- Purpose:
--   - signup_applications は「申請用 insert 専用テーブル」
--   - 認証済みユーザーのみ insert 可
--   - applicant_user_id は auth.uid() に固定
--   - 承認・参照は service_role（admin API）のみ
-- =====================================================

-- RLS 有効化
alter table public.signup_applications enable row level security;

-- 既存ポリシー整理
drop policy if exists signup_applications_insert_authenticated on public.signup_applications;

-- INSERT: 認証済みユーザーのみ / 自分のIDでのみ作成可
create policy signup_applications__insert__own__authenticated
on public.signup_applications
for insert
to authenticated
with check (
  applicant_user_id = auth.uid()
);

-- SELECT / UPDATE / DELETE は作らない
-- → authenticated では一切不可
-- → service_role（admin API）だけが操作可能