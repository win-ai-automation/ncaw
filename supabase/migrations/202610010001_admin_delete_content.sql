-- Administrators may permanently delete content. Related versions and reviews
-- are removed by the foreign-key cascade rules defined in the base migration.
grant delete on public.content_items to authenticated;

create policy content_delete_admin on public.content_items
for delete to authenticated
using (public.has_app_role(array['admin']::public.app_role[]));
