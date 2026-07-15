alter table challenges add column origin text not null default 'manual' check (
  origin in ('manual', 'daily')
);
alter table challenges add column daily_date text check (
  daily_date is null or daily_date glob '????-??-??'
);
alter table challenges add column source text not null default 'curated' check (
  source in ('curated', 'wikipedia_random')
);

create table challenge_number_sequence (
  sequence_name text primary key check (sequence_name = 'global'),
  next_sort_order integer not null check (next_sort_order > 0)
);

insert or ignore into challenge_number_sequence (sequence_name, next_sort_order)
select 'global', coalesce(max(sort_order), 0) + 1 from challenges
;

create unique index challenges_daily_date_unique_idx
  on challenges (daily_date)
  where daily_date is not null;

create table daily_challenge_jobs (
  daily_date text primary key check (daily_date glob '????-??-??'),
  status text not null check (status in ('pending', 'claimed', 'accepted')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at text not null,
  lease_token text,
  lease_expires_at text,
  accepted_challenge_id text references challenges(id),
  failure_code text,
  created_at text not null,
  updated_at text not null,
  check (
    (status = 'claimed' and lease_token is not null and lease_expires_at is not null)
    or (status <> 'claimed' and lease_token is null and lease_expires_at is null)
  )
);

create index daily_challenge_jobs_due_idx
  on daily_challenge_jobs (status, next_attempt_at, daily_date);
