-- =====================================================
-- File: 20251212_30_approve_store_signup_rpc.sql
-- Purpose:
--   - store 申請（signup_applications）を承認し、
--     1) stores に正式登録
--     2) users.role を "store" に更新
--     3) signup_applications.status を "approved" に更新
--   - 1トランザクションで実行
-- Security:
--   - security definer
--   - 実行権限は service_role のみ（推奨） or 管理者ロールのみ
-- =====================================================

create or replace function public.approve_store_signup(p_app_id uuid)
returns public.signup_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app          public.signup_applications%rowtype;
  v_owner_id     uuid;
  v_area         text;
  v_description  text;
  v_website_url  text;
begin
  -- (重要) 管理者以外は実行不可にしたい場合はここでガード
  -- 例: users.role='admin' 方式にするなら下記を有効化
  -- if auth.uid() is null then
  --   raise exception 'not authenticated';
  -- end if;
  -- if not exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin') then
  --   raise exception 'not authorized';
  -- end if;

  -- 対象申請をロックして取得（store & pending）
  select *
    into v_app
  from public.signup_applications
  where id = p_app_id
    and type = 'store'
    and status = 'pending'
  for update;

  if not found then
    raise exception 'store signup not found or not pending (id=%)', p_app_id;
  end if;

  -- payload から owner_user_id（currentUserId）を uuid として読む
  begin
    v_owner_id := nullif(v_app.payload->>'currentUserId', '')::uuid;
  exception when others then
    v_owner_id := null;
  end;

  -- ★ owner_user_id は必須。null は許可しない（guest申請をDB側で遮断）
  if v_owner_id is null then
    raise exception 'owner_user_id is null (signup must be authenticated user)';
  end if;

  -- payload 取り出し
  v_area        := v_app.payload->>'area';
  v_description := v_app.payload->>'note';
  v_website_url := v_app.payload->>'website';

  -- stores 作成
  insert into public.stores (
    id,
    owner_user_id,
    name,
    area,
    description,
    website_url,
    x_url,
    twicas_url,
    line_url,
    created_at
  )
  values (
    gen_random_uuid(),
    v_owner_id,
    v_app.name,
    v_area,
    v_description,
    v_website_url,
    null,
    null,
    null,
    now()
  );

  -- users.role を "store" に更新（必ず owner がいる前提）
  update public.users
  set role = 'store'
  where id = v_owner_id;

  -- 申請を approved に
  update public.signup_applications
  set status = 'approved',
      reviewed_at = now()
  where id = v_app.id;

  return (
    select *
    from public.signup_applications
    where id = v_app.id
  );
end;
$$;

-- 権限（最も安全な既定：public から剥がす）
revoke all on function public.approve_store_signup(uuid) from public;

-- ここは運用方針で分岐：
-- A) 管理画面は service_role で呼ぶ（推奨）：grant不要（service_roleはRLSも越える）
-- B) authenticated の中の admin だけ呼ぶ：下の grant を使い、関数内ガードをONにする
-- grant execute on function public.approve_store_signup(uuid) to authenticated;