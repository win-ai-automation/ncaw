-- Add one reusable generated social image to each content version.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['text/markdown','text/html','application/json','text/plain','image/jpeg','image/png','image/webp']
where id = 'content-assets';

alter table public.content_assets
  drop constraint if exists content_assets_asset_type_check;

alter table public.content_assets
  add constraint content_assets_asset_type_check
  check (asset_type in ('case_study_markdown','case_study_html','social_pack','accuracy_review','social_image'));
