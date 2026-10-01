-- Persist the approved publishing destination and schedule for operational tracking.
alter table public.content_items
  add column if not exists target_account_ids jsonb not null default '[]'::jsonb
    check (jsonb_typeof(target_account_ids) = 'array'),
  add column if not exists scheduled_at timestamptz;

create index if not exists content_items_scheduled_idx
  on public.content_items (scheduled_at)
  where scheduled_at is not null;
