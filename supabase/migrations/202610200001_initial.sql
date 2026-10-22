-- 課堂文字雲資料表、講師列權限與匿名作答入口。
create extension if not exists pgcrypto;
create schema if not exists private;
grant usage on schema public to anon, authenticated, service_role;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null default '' check (char_length(prompt) <= 140),
  status text not null default 'active' check (status in ('active', 'archived')),
  blocked_words text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists activities_owner_created_idx on public.activities(owner_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists activities_set_updated_at on public.activities;
create trigger activities_set_updated_at
before update on public.activities
for each row execute function public.set_updated_at();

create table if not exists public.responses (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 120),
  status text not null default 'approved' check (status in ('approved', 'held')),
  moderation_reason text,
  created_at timestamptz not null default now()
);

create index if not exists responses_activity_created_idx on public.responses(activity_id, created_at desc);

-- 這些防濫發紀錄只存在 private schema，資料列不會透過前端 API 開放。
create table if not exists private.response_sessions (
  activity_id uuid not null references public.activities(id) on delete cascade,
  session_digest text not null,
  response_id uuid not null unique references public.responses(id) on delete cascade deferrable initially deferred,
  created_at timestamptz not null default now(),
  primary key (activity_id, session_digest)
);

create table if not exists private.ip_rate_windows (
  ip_digest text primary key,
  window_started timestamptz not null,
  hits integer not null check (hits > 0)
);

alter table private.response_sessions enable row level security;
alter table private.ip_rate_windows enable row level security;
revoke all on all tables in schema private from public, anon, authenticated;
grant all on all tables in schema private to service_role;

alter table public.activities enable row level security;
alter table public.responses enable row level security;

drop policy if exists "activity owners manage their sessions" on public.activities;
create policy "activity owners manage their sessions"
on public.activities for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

-- 學生只可用 QR Code 中的單一活動 UUID 讀取題目；不提供活動清單或講師欄位。
create or replace function public.get_public_activity(p_activity_id uuid)
returns table(id uuid, prompt text, status text)
language sql
security definer
set search_path = public, pg_temp
as $$
  select a.id, a.prompt, a.status
  from public.activities a
  where a.id = p_activity_id;
$$;

revoke all on function public.get_public_activity(uuid) from public, anon, authenticated;
grant execute on function public.get_public_activity(uuid) to anon, authenticated;

drop policy if exists "owners can read activity responses" on public.responses;
create policy "owners can read activity responses"
on public.responses for select to authenticated
using (exists (
  select 1 from public.activities a
  where a.id = responses.activity_id and a.owner_id = (select auth.uid())
));

drop policy if exists "owners can moderate activity responses" on public.responses;
create policy "owners can moderate activity responses"
on public.responses for update to authenticated
using (exists (
  select 1 from public.activities a
  where a.id = responses.activity_id and a.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.activities a
  where a.id = responses.activity_id and a.owner_id = (select auth.uid())
));

drop policy if exists "owners can delete activity responses" on public.responses;
create policy "owners can delete activity responses"
on public.responses for delete to authenticated
using (exists (
  select 1 from public.activities a
  where a.id = responses.activity_id and a.owner_id = (select auth.uid())
));

revoke all on public.activities from anon, authenticated;
grant select, insert, update, delete on public.activities to authenticated;
grant all on public.activities to service_role;

revoke all on public.responses from anon, authenticated;
grant select, update, delete on public.responses to authenticated;
grant all on public.responses to service_role;

create or replace function public.accept_public_response(
  p_activity_id uuid,
  p_content text,
  p_session_digest text,
  p_ip_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_activity public.activities%rowtype;
  v_content text := btrim(coalesce(p_content, ''));
  v_response_id uuid := gen_random_uuid();
  v_session_id uuid;
  v_now timestamptz := clock_timestamp();
  v_hits integer;
  v_status text := 'approved';
  v_reason text := null;
begin
  select * into v_activity from public.activities where id = p_activity_id;
  if not found then
    return jsonb_build_object('accepted', false, 'reason', 'not_found');
  end if;
  if v_activity.status <> 'active' then
    return jsonb_build_object('accepted', false, 'reason', 'inactive');
  end if;
  if char_length(v_content) = 0 then
    return jsonb_build_object('accepted', false, 'reason', 'empty');
  end if;
  if char_length(v_content) > 120 then
    return jsonb_build_object('accepted', false, 'reason', 'too_long');
  end if;
  if exists (
    select 1
    from unnest(coalesce(v_activity.blocked_words, '{}'::text[])) as item(word)
    where length(btrim(item.word)) > 0
      and strpos(lower(v_content), lower(btrim(item.word))) > 0
  ) then
    return jsonb_build_object('accepted', false, 'reason', 'blocked');
  end if;

  -- 每個來源位址每分鐘最多 300 次，適合一般課堂同一 Wi-Fi 下多人同時送出。
  insert into private.ip_rate_windows as rate(ip_digest, window_started, hits)
  values (p_ip_digest, v_now, 1)
  on conflict (ip_digest) do update
  set hits = case
        when rate.window_started < v_now - interval '1 minute' then 1
        else rate.hits + 1
      end,
      window_started = case
        when rate.window_started < v_now - interval '1 minute' then v_now
        else rate.window_started
      end
  returning hits into v_hits;

  if v_hits > 300 then
    return jsonb_build_object('accepted', false, 'reason', 'rate_limited');
  end if;

  insert into private.response_sessions(activity_id, session_digest, response_id)
  values (p_activity_id, p_session_digest, v_response_id)
  on conflict (activity_id, session_digest) do nothing
  returning response_id into v_session_id;

  if v_session_id is null then
    return jsonb_build_object('accepted', false, 'reason', 'duplicate');
  end if;

  if v_content ~* '(https?://|www[.])' then
    v_status := 'held';
    v_reason := '內容含有外部連結，等待講師確認';
  end if;

  insert into public.responses(id, activity_id, content, status, moderation_reason)
  values (v_response_id, p_activity_id, v_content, v_status, v_reason);

  return jsonb_build_object('accepted', true, 'status', v_status);
end;
$$;

revoke all on function public.accept_public_response(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.accept_public_response(uuid, text, text, text) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'responses'
  ) then
    alter publication supabase_realtime add table public.responses;
  end if;
end;
$$;
