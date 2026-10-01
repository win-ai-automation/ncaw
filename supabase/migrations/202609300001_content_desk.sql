-- Netfintax Content Desk: application data, authorization and audit history.
create extension if not exists pgcrypto;

create type public.app_role as enum ('employee', 'reviewer', 'admin');
create type public.content_status as enum ('received', 'processing', 'pending_review', 'revision_requested', 'approved', 'scheduled', 'published', 'rejected', 'failed');
create type public.risk_level as enum ('low', 'medium', 'high');
create type public.review_decision as enum ('approve', 'request_revision', 'reject');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  role public.app_role not null default 'employee',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Nội dung chưa đặt tên' check (char_length(title) <= 240),
  source_url text,
  platform text not null default 'web' check (char_length(platform) <= 40),
  raw_content text,
  submitter_notes text check (char_length(submitter_notes) <= 5000),
  status public.content_status not null default 'received',
  risk_level public.risk_level not null default 'low',
  risk_flags jsonb not null default '[]'::jsonb check (jsonb_typeof(risk_flags) = 'array'),
  submitted_by uuid not null references public.profiles(id),
  assigned_reviewer uuid references public.profiles(id),
  external_job_id text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_has_source check (source_url is not null or raw_content is not null)
);

create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  generated_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(generated_payload) = 'object'),
  editor_content text,
  change_note text check (char_length(change_note) <= 1000),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (content_id, version_number)
);

create table public.content_reviews (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  version_id uuid not null references public.content_versions(id),
  reviewer_id uuid not null references public.profiles(id),
  decision public.review_decision not null,
  comment text check (char_length(comment) <= 5000),
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  content_id uuid references public.content_items(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) <= 100),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index content_items_status_created_idx on public.content_items(status, created_at desc);
create index content_items_submitter_idx on public.content_items(submitted_by, created_at desc);
create index content_versions_content_idx on public.content_versions(content_id, version_number desc);
create index content_reviews_content_idx on public.content_reviews(content_id, created_at desc);
create index audit_events_content_idx on public.audit_events(content_id, created_at desc);

create function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger content_items_updated_at before update on public.content_items for each row execute function public.set_updated_at();

-- Security-definer avoids recursive profile policies. Only the boolean result is exposed.
create function public.has_app_role(required_roles public.app_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = any(required_roles)
  );
$$;
revoke all on function public.has_app_role(public.app_role[]) from public;
grant execute on function public.has_app_role(public.app_role[]) to authenticated;

alter table public.profiles enable row level security;
alter table public.content_items enable row level security;
alter table public.content_versions enable row level security;
alter table public.content_reviews enable row level security;
alter table public.audit_events enable row level security;

revoke all on table public.profiles, public.content_items, public.content_versions, public.content_reviews, public.audit_events from anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.content_items to authenticated;
grant select, insert on public.content_versions to authenticated;
grant select, insert on public.content_reviews to authenticated;
grant select on public.audit_events to authenticated;

create policy profiles_select on public.profiles for select to authenticated
using ((select auth.uid()) = id or public.has_app_role(array['reviewer','admin']::public.app_role[]));

create policy content_select on public.content_items for select to authenticated using (true);
create policy content_insert on public.content_items for insert to authenticated
with check ((select auth.uid()) = submitted_by);
create policy content_update on public.content_items for update to authenticated
using (submitted_by = (select auth.uid()) or public.has_app_role(array['reviewer','admin']::public.app_role[]))
with check (submitted_by = (select auth.uid()) or public.has_app_role(array['reviewer','admin']::public.app_role[]));

create policy versions_select on public.content_versions for select to authenticated using (true);
create policy versions_insert on public.content_versions for insert to authenticated
with check (created_by = (select auth.uid()) or public.has_app_role(array['reviewer','admin']::public.app_role[]));

create policy reviews_select on public.content_reviews for select to authenticated using (true);
create policy reviews_insert on public.content_reviews for insert to authenticated
with check (reviewer_id = (select auth.uid()) and public.has_app_role(array['reviewer','admin']::public.app_role[]));

create policy audit_select on public.audit_events for select to authenticated
using (public.has_app_role(array['admin']::public.app_role[]));

-- New Auth users receive an employee profile. Promote reviewers/admins explicitly.
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

