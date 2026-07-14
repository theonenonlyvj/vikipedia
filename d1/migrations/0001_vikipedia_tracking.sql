create table if not exists account_profiles (
  account_id text primary key,
  public_name text not null check (length(trim(public_name)) between 1 and 24),
  identity_status text not null check (
    identity_status in ('ghost', 'claimed', 'merged')
  ),
  updated_at text not null
);

create table if not exists challenges (
  id text primary key,
  label text not null,
  start_title text not null,
  target_title text not null,
  ruleset text not null check (ruleset = 'ranked_classic'),
  sort_order integer not null unique,
  is_active integer not null default 1 check (is_active in (0, 1)),
  created_at text not null
);

create table if not exists runs (
  id text primary key,
  challenge_id text not null references challenges(id),
  account_id text not null,
  status text not null check (status in ('active', 'completed', 'abandoned')),
  started_at text not null,
  completed_at text,
  abandoned_at text,
  elapsed_ms integer,
  click_count integer not null default 0 check (click_count >= 0),
  start_title text not null,
  target_title text not null,
  final_title text,
  created_at text not null,
  updated_at text not null
);

create table if not exists run_events (
  id text primary key,
  run_id text not null references runs(id) on delete cascade,
  event_type text not null check (
    event_type in ('run_started', 'page_clicked', 'run_completed', 'run_abandoned')
  ),
  step_number integer,
  source_title text,
  clicked_anchor_text text,
  requested_title text,
  destination_title text,
  destination_page_id integer,
  client_timestamp_ms integer,
  created_at text not null
);

create table if not exists run_path_steps (
  run_id text not null references runs(id) on delete cascade,
  step_number integer not null,
  source_title text not null,
  clicked_anchor_text text not null,
  destination_title text not null,
  destination_page_id integer,
  elapsed_since_start_ms integer,
  created_at text not null,
  primary key (run_id, step_number)
);

create index if not exists runs_challenge_leaderboard_idx
  on runs (challenge_id, status, elapsed_ms, click_count, completed_at);

create index if not exists runs_account_idx
  on runs (account_id);

create index if not exists run_events_run_created_idx
  on run_events (run_id, created_at);

create index if not exists run_path_steps_run_step_idx
  on run_path_steps (run_id, step_number);

insert into challenges (
  id,
  label,
  start_title,
  target_title,
  ruleset,
  sort_order,
  is_active,
  created_at
)
values (
  'challenge-0001',
  'Challenge #1',
  'Moon',
  'Gravity',
  'ranked_classic',
  1,
  1,
  '2026-07-14T00:00:00.000Z'
)
on conflict(id) do update set
  label = excluded.label,
  start_title = excluded.start_title,
  target_title = excluded.target_title,
  ruleset = excluded.ruleset,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;
