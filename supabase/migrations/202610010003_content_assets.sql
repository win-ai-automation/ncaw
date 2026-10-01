-- Versioned generated files stored in a private Supabase Storage bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('content-assets', 'content-assets', false, 5242880, array['text/markdown','text/html','application/json','text/plain'])
on conflict (id) do nothing;

create table public.content_assets (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  version_id uuid not null references public.content_versions(id) on delete cascade,
  asset_type text not null check (asset_type in ('case_study_markdown','case_study_html','social_pack','accuracy_review')),
  storage_path text not null unique,
  mime_type text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index content_assets_version_idx on public.content_assets(version_id, created_at desc);
alter table public.content_assets enable row level security;
grant select, insert on public.content_assets to authenticated;

create policy content_assets_select on public.content_assets for select to authenticated using (true);
create policy content_assets_insert on public.content_assets for insert to authenticated
with check (created_by = (select auth.uid()) or public.has_app_role(array['reviewer','admin']::public.app_role[]));

create policy content_asset_objects_select on storage.objects for select to authenticated
using (bucket_id = 'content-assets');
create policy content_asset_objects_insert on storage.objects for insert to authenticated
with check (bucket_id = 'content-assets' and owner_id = (select auth.uid()::text));
create policy content_asset_objects_update on storage.objects for update to authenticated
using (bucket_id = 'content-assets' and owner_id = (select auth.uid()::text));
