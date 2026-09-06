-- Workplan schema - run this once in your Supabase project's SQL editor.
-- Single table: every task belongs to a day (date) and a block (e.g. "prayer", "tbv_work").

create schema if not exists workplan;

create table if not exists workplan.tasks (
  id uuid primary key default gen_random_uuid(),
  block_id text not null,
  date date not null,
  text text not null,
  done boolean not null default false,
  position integer not null default 0,
  recurring boolean not null default false,
  recurrence_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists tasks_date_idx on workplan.tasks (date);
create index if not exists tasks_block_date_idx on workplan.tasks (block_id, date);
create index if not exists tasks_recurrence_id_idx on workplan.tasks (recurrence_id);

-- This is a single-user personal tool using the anon key directly, so RLS is left
-- disabled for simplicity. If you ever make the URL public or add other users,
-- turn RLS on and add a policy scoped to auth.uid() or a shared secret column.
alter table workplan.tasks disable row level security;

grant usage on schema workplan to anon, authenticated;
grant select, insert, update, delete on workplan.tasks to anon, authenticated;

alter role authenticator set pgrst.db_schemas = 'public, storage, graphql_public, workplan';
notify pgrst, 'reload config';
