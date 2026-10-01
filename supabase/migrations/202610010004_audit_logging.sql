-- Authenticated application actions are written through a controlled function.
create or replace function public.record_audit_event(
  target_content_id uuid,
  event_action text,
  event_metadata jsonb default '{}'::jsonb
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare event_id bigint;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if event_action is null or char_length(trim(event_action)) < 1 or char_length(event_action) > 100 then raise exception 'Invalid audit action'; end if;
  if jsonb_typeof(coalesce(event_metadata, '{}'::jsonb)) <> 'object' then raise exception 'Audit metadata must be an object'; end if;
  insert into public.audit_events (content_id, actor_id, action, metadata)
  values (target_content_id, (select auth.uid()), trim(event_action), coalesce(event_metadata, '{}'::jsonb))
  returning id into event_id;
  return event_id;
end;
$$;

revoke all on function public.record_audit_event(uuid, text, jsonb) from public;
grant execute on function public.record_audit_event(uuid, text, jsonb) to authenticated;
