create extension if not exists "pgcrypto";

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(trim(display_name)) between 1 and 24),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists challenges (
  id text primary key,
  label text not null,
  start_title text not null,
  target_title text not null,
  ruleset text not null,
  sort_order integer not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  challenge_id text not null references challenges(id),
  player_id uuid not null references players(id),
  status text not null check (status in ('active', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  abandoned_at timestamptz,
  elapsed_ms integer,
  click_count integer not null default 0 check (click_count >= 0),
  start_title text not null,
  target_title text not null,
  final_title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  event_type text not null check (
    event_type in ('run_started', 'page_clicked', 'run_completed', 'run_abandoned')
  ),
  step_number integer,
  source_title text,
  clicked_anchor_text text,
  requested_title text,
  destination_title text,
  destination_page_id integer,
  client_timestamp_ms bigint,
  created_at timestamptz not null default now()
);

create table if not exists run_path_steps (
  run_id uuid not null references runs(id) on delete cascade,
  step_number integer not null,
  source_title text not null,
  clicked_anchor_text text not null,
  destination_title text not null,
  destination_page_id integer,
  elapsed_since_start_ms integer,
  created_at timestamptz not null default now(),
  primary key (run_id, step_number)
);

create index if not exists runs_challenge_leaderboard_idx
  on runs (challenge_id, status, elapsed_ms, click_count, completed_at);

create index if not exists runs_player_idx
  on runs (player_id);

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
  is_active
)
values (
  'challenge-0001',
  'Challenge #1',
  'Moon',
  'Gravity',
  'ranked_classic',
  1,
  true
)
on conflict (id) do update set
  label = excluded.label,
  start_title = excluded.start_title,
  target_title = excluded.target_title,
  ruleset = excluded.ruleset,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;
