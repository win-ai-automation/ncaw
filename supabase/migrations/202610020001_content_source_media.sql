-- Private, short-lived source media captured by the browser helper for transcription.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('content-source-media', 'content-source-media', false, 25165824, array['video/mp4','video/webm','video/quicktime','audio/mpeg','audio/mp4','audio/webm','application/octet-stream'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy content_source_media_insert on storage.objects for insert to authenticated
with check (bucket_id = 'content-source-media' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy content_source_media_update on storage.objects for update to authenticated
using (bucket_id = 'content-source-media' and owner_id = (select auth.uid()::text));

create policy content_source_media_select on storage.objects for select to authenticated
using (bucket_id = 'content-source-media' and owner_id = (select auth.uid()::text));
