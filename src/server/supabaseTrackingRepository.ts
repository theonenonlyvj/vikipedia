import { createClient } from "@supabase/supabase-js";
import { normalizeTitle } from "../domain/rules";
import { rankLeaderboardRows } from "../domain/serverLeaderboard";
import type {
  Challenge,
  RankedLeaderboardRow,
  ServerLeaderboardRow,
  ServerPathStep,
} from "../domain/types";
import { ApiError } from "./http";
import type {
  PlayerRecord,
  RunRecordResponse,
  TrackingRepository,
} from "./trackingRepository";

type SupabaseResult<T> = PromiseLike<{
  data: T | null;
  error: null | { message: string };
}>;

type SupabaseQuery<T = unknown> = SupabaseResult<T> & {
  select(columns?: string): SupabaseQuery<T>;
  insert(payload: unknown): SupabaseQuery<T>;
  update(payload: unknown): SupabaseQuery<T>;
  eq(column: string, value: unknown): SupabaseQuery<T>;
  order(column: string, options?: { ascending?: boolean }): SupabaseQuery<T>;
  limit(count: number): SupabaseQuery<T>;
  single(): Promise<{ data: T | null; error: null | { message: string } }>;
};

export interface SupabaseClientLike {
  from(table: string): SupabaseQuery;
}

export function createSupabaseTrackingRepository(options: {
  url: string;
  serviceRoleKey: string;
  now?: () => Date;
}): TrackingRepository {
  return createSupabaseTrackingRepositoryFromClient(
    createClient(options.url, options.serviceRoleKey, {
      auth: { persistSession: false },
    }) as unknown as SupabaseClientLike,
    options.now,
  );
}

export function createSupabaseTrackingRepositoryFromClient(
  client: SupabaseClientLike,
  now: () => Date = () => new Date(),
): TrackingRepository {
  const timestamp = () => now().toISOString();

  return {
    async listChallenges() {
      const { data, error } = await client
        .from("challenges")
        .select(
          "id,label,start_title,target_title,ruleset,sort_order,is_active",
        )
        .eq("is_active", true)
        .order("sort_order");
      assertNoError(error, "challenge_list_failed");
      return ((data ?? []) as ChallengeRow[]).map(mapChallengeRow);
    },

    async upsertPlayer(input) {
      const displayName = input.displayName.trim().slice(0, 24);
      const payload = {
        display_name: displayName,
        last_seen_at: timestamp(),
      };

      if (input.playerId) {
        const { data, error } = await client
          .from("players")
          .update(payload)
          .eq("id", input.playerId)
          .select("id,display_name")
          .single();
        assertNoError(error, "player_update_failed");
        return mapPlayerRow(data as PlayerRow);
      }

      const { data, error } = await client
        .from("players")
        .insert(payload)
        .select("id,display_name")
        .single();
      assertNoError(error, "player_insert_failed");
      return mapPlayerRow(data as PlayerRow);
    },

    async startRun(input) {
      const { data: challenge, error: challengeError } = await client
        .from("challenges")
        .select("id,start_title,target_title")
        .eq("id", input.challengeId)
        .single();
      assertNoError(challengeError, "challenge_lookup_failed");

      const challengeRow = challenge as Pick<
        ChallengeRow,
        "id" | "start_title" | "target_title"
      >;
      const { data: run, error: runError } = await client
        .from("runs")
        .insert({
          challenge_id: input.challengeId,
          player_id: input.playerId,
          status: "active",
          start_title: challengeRow.start_title,
          target_title: challengeRow.target_title,
          click_count: 0,
        })
        .select(
          "id,challenge_id,player_id,status,start_title,target_title,click_count,started_at,completed_at,elapsed_ms",
        )
        .single();
      assertNoError(runError, "run_start_failed");

      const runRow = run as RunRow;
      const { error: eventError } = await client.from("run_events").insert({
        run_id: runRow.id,
        event_type: "run_started",
      });
      assertNoError(eventError, "run_start_event_failed");

      return mapRunRow(runRow);
    },

    async recordClick(runId, input) {
      const { data: run, error: runError } = await client
        .from("runs")
        .select("id,status,click_count,started_at")
        .eq("id", runId)
        .single();
      assertNoError(runError, "run_lookup_failed");

      const runRow = run as Pick<
        RunRow,
        "id" | "status" | "click_count" | "started_at"
      >;
      if (runRow.status !== "active") {
        throw new ApiError("run_not_active", "This run is not active.", 409);
      }

      const stepNumber = runRow.click_count + 1;
      const createdAt = timestamp();
      const elapsedSinceStartMs = Math.max(
        0,
        Date.parse(createdAt) - Date.parse(runRow.started_at),
      );

      const { error: eventError } = await client.from("run_events").insert({
        run_id: runId,
        event_type: "page_clicked",
        step_number: stepNumber,
        source_title: input.sourceTitle,
        clicked_anchor_text: input.clickedAnchorText,
        requested_title: input.requestedTitle,
        destination_title: input.destinationTitle,
        destination_page_id: input.destinationPageId,
        client_timestamp_ms: input.clientTimestampMs,
      });
      assertNoError(eventError, "click_event_failed");

      const { error: pathError } = await client.from("run_path_steps").insert({
        run_id: runId,
        step_number: stepNumber,
        source_title: input.sourceTitle,
        clicked_anchor_text: input.clickedAnchorText,
        destination_title: input.destinationTitle,
        destination_page_id: input.destinationPageId,
        elapsed_since_start_ms: elapsedSinceStartMs,
        created_at: createdAt,
      });
      assertNoError(pathError, "click_path_failed");

      const clickCount = stepNumber;
      const { error: updateError } = await client
        .from("runs")
        .update({ click_count: clickCount, updated_at: createdAt })
        .eq("id", runId);
      assertNoError(updateError, "click_count_update_failed");

      return { clickCount };
    },

    async completeRun(runId, input) {
      const { data: run, error: runError } = await client
        .from("runs")
        .select(
          "id,challenge_id,player_id,status,start_title,target_title,click_count,started_at",
        )
        .eq("id", runId)
        .single();
      assertNoError(runError, "run_lookup_failed");

      const runRow = run as RunRow;
      if (runRow.status !== "active") {
        throw new ApiError("run_not_active", "This run is not active.", 409);
      }
      if (normalizeTitle(input.finalTitle) !== normalizeTitle(runRow.target_title)) {
        throw new ApiError(
          "target_mismatch",
          "The final article does not match the challenge target.",
          409,
        );
      }

      const completedAt = timestamp();
      const elapsedMs = Math.max(
        0,
        Date.parse(completedAt) - Date.parse(runRow.started_at),
      );

      const { error: updateError } = await client
        .from("runs")
        .update({
          status: "completed",
          completed_at: completedAt,
          elapsed_ms: elapsedMs,
          final_title: input.finalTitle,
          updated_at: completedAt,
        })
        .eq("id", runId);
      assertNoError(updateError, "run_complete_failed");

      const { error: eventError } = await client.from("run_events").insert({
        run_id: runId,
        event_type: "run_completed",
        destination_title: input.finalTitle,
        client_timestamp_ms: input.clientTimestampMs,
      });
      assertNoError(eventError, "run_complete_event_failed");

      const leaderboard = await this.listLeaderboard(runRow.challenge_id);
      const leaderboardRow = leaderboard.find((row) => row.runId === runId);
      if (!leaderboardRow) {
        throw new ApiError(
          "leaderboard_row_missing",
          "Completed run was not found on the leaderboard.",
          500,
        );
      }
      return leaderboardRow;
    },

    async abandonRun(runId) {
      const abandonedAt = timestamp();
      const { error: updateError } = await client
        .from("runs")
        .update({
          status: "abandoned",
          abandoned_at: abandonedAt,
          updated_at: abandonedAt,
        })
        .eq("id", runId);
      assertNoError(updateError, "run_abandon_failed");

      const { error: eventError } = await client.from("run_events").insert({
        run_id: runId,
        event_type: "run_abandoned",
      });
      assertNoError(eventError, "run_abandon_event_failed");

      return { status: "abandoned" };
    },

    async listLeaderboard(challengeId) {
      const { data, error } = await client
        .from("runs")
        .select(
          "id,challenge_id,player_id,elapsed_ms,click_count,completed_at,player:players(display_name),path_preview:run_path_steps(step_number,source_title,clicked_anchor_text,destination_title,destination_page_id,elapsed_since_start_ms,created_at)",
        )
        .eq("challenge_id", challengeId)
        .eq("status", "completed");
      assertNoError(error, "leaderboard_failed");
      return rankLeaderboardRows(
        ((data ?? []) as LeaderboardRunRow[]).map(mapLeaderboardRow),
      );
    },

    async getRunPath(runId) {
      const { data, error } = await client
        .from("run_path_steps")
        .select(
          "step_number,source_title,clicked_anchor_text,destination_title,destination_page_id,elapsed_since_start_ms,created_at",
        )
        .eq("run_id", runId)
        .order("step_number");
      assertNoError(error, "run_path_failed");
      return ((data ?? []) as PathStepRow[]).map(mapPathStepRow);
    },
  };
}

function assertNoError(
  error: null | { message: string },
  code: string,
): void {
  if (error) {
    throw new ApiError(code, error.message, 500);
  }
}

function mapChallengeRow(row: ChallengeRow): Challenge {
  return {
    id: row.id,
    label: row.label,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    mode: "daily",
    start: { title: row.start_title },
    target: { title: row.target_title },
    ruleset: "ranked_classic",
    source: "curated",
  };
}

function mapPlayerRow(row: PlayerRow): PlayerRecord {
  return {
    id: row.id,
    displayName: row.display_name,
  };
}

function mapRunRow(row: RunRow): RunRecordResponse {
  return {
    id: row.id,
    challengeId: row.challenge_id,
    playerId: row.player_id,
    status: row.status,
    startTitle: row.start_title,
    targetTitle: row.target_title,
    clickCount: row.click_count,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    elapsedMs: row.elapsed_ms ?? undefined,
  };
}

function mapLeaderboardRow(row: LeaderboardRunRow): ServerLeaderboardRow {
  return {
    runId: row.id,
    challengeId: row.challenge_id,
    playerId: row.player_id,
    displayName: readDisplayName(row.player),
    elapsedMs: row.elapsed_ms,
    clickCount: row.click_count,
    completedAt: row.completed_at,
    pathPreview: (row.path_preview ?? [])
      .slice()
      .sort((a, b) => a.step_number - b.step_number)
      .map(mapPathStepRow),
  };
}

function readDisplayName(player: PlayerJoin | PlayerJoin[] | undefined): string {
  const value = Array.isArray(player) ? player[0] : player;
  return value?.display_name ?? "Unknown";
}

function mapPathStepRow(row: PathStepRow): ServerPathStep {
  return {
    stepNumber: row.step_number,
    sourceTitle: row.source_title,
    clickedAnchorText: row.clicked_anchor_text,
    destinationTitle: row.destination_title,
    destinationPageId: row.destination_page_id ?? undefined,
    elapsedSinceStartMs: row.elapsed_since_start_ms ?? undefined,
    createdAt: row.created_at,
  };
}

interface ChallengeRow {
  id: string;
  label: string;
  start_title: string;
  target_title: string;
  ruleset: string;
  sort_order: number;
  is_active: boolean;
}

interface PlayerRow {
  id: string;
  display_name: string;
}

interface RunRow {
  id: string;
  challenge_id: string;
  player_id: string;
  status: "active" | "completed" | "abandoned";
  start_title: string;
  target_title: string;
  click_count: number;
  started_at: string;
  completed_at?: string | null;
  elapsed_ms?: number | null;
}

interface PlayerJoin {
  display_name: string;
}

interface LeaderboardRunRow {
  id: string;
  challenge_id: string;
  player_id: string;
  elapsed_ms: number;
  click_count: number;
  completed_at: string;
  player?: PlayerJoin | PlayerJoin[];
  path_preview?: PathStepRow[];
}

interface PathStepRow {
  step_number: number;
  source_title: string;
  clicked_anchor_text: string;
  destination_title: string;
  destination_page_id?: number | null;
  elapsed_since_start_ms?: number | null;
  created_at: string;
}
