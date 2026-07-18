-- Additive only. Manual moderation flag: a run with board_excluded = 1 is
-- omitted from leaderboards and placement math (containment for forged or
-- broken runs). Account stats intentionally still include it.
alter table runs add column board_excluded integer not null default 0
  check (board_excluded in (0, 1));

create index if not exists runs_board_excluded_idx
  on runs (challenge_id, board_excluded);
