-- users: RLS 有効化
alter table public.users enable row level security;

-- 既存ポリシーがあれば整理（任意）
drop policy if exists users__insert__self__authenticated on public.users;
drop policy if exists users__update__self__authenticated on public.users;
drop policy if exists users__select__self__authenticated on public.users;

-- SELECT: 自分の行だけ読める（アプリ的に必要になることが多い）
create policy users__select__self__authenticated
on public.users
for select
to authenticated
using (id = auth.uid());

-- INSERT: 自分の行だけ作れる（新規登録直後の upsert を通すために必須）
create policy users__insert__self__authenticated
on public.users
for insert
to authenticated
with check (id = auth.uid());

-- UPDATE: 自分の行だけ更新できる（upsert は update も起きるので実質必須）
create policy users__update__self__authenticated
on public.users
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());