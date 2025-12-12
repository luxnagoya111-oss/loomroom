-- 20251212_01_users_auth_bootstrap.sql
-- 目的:
--  - public.users は auth.users と id を一致させる
--  - 新規Auth作成時に public.users を自動作成する（フロントupsert不要）
--  - users は「自分の行だけ select/update」できる

-- 0) users.id の default を外す（auth.uid を正とするため）
alter table public.users
alter column id drop default;

-- 1) RLS 有効化
alter table public.users enable row level security;

-- 2) 新規Authユーザー作成時に public.users を作る関数
create or replace function public.fn__auth__handle_new_user__v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, name, role, created_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'User'),
    'user',
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- 3) トリガー（auth.users に insert されたら動く）
drop trigger if exists trg__auth_users__after_insert__create_public_user on auth.users;

create trigger trg__auth_users__after_insert__create_public_user
after insert on auth.users
for each row execute procedure public.fn__auth__handle_new_user__v1();

-- 4) users のポリシー（自分の行だけ）
drop policy if exists users__select__own__authenticated on public.users;
create policy users__select__own__authenticated
on public.users
for select
to authenticated
using (id = auth.uid());

drop policy if exists users__update__own__authenticated on public.users;
create policy users__update__own__authenticated
on public.users
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());