import { describe, expect, it, vi } from "vitest";
import { createSupabaseTrackingRepositoryFromClient } from "./supabaseTrackingRepository";
import type { SupabaseClientLike } from "./supabaseTrackingRepository";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

class FakeQuery {
  private action: "select" | "insert" | "update" = "select";
  private payload: unknown;
  private filters: Record<string, unknown> = {};
  private orderColumn: string | null = null;

  constructor(
    private readonly table: string,
    private readonly handler: (query: {
      table: string;
      action: "select" | "insert" | "update";
      payload: unknown;
      filters: Record<string, unknown>;
      orderColumn: string | null;
      single: boolean;
    }) => Promise<{ data: unknown; error: null | { message: string } }>,
  ) {}

  select(): this {
    return this;
  }

  insert(payload: unknown): this {
    this.action = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: unknown): this {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters[column] = value;
    return this;
  }

  order(column: string): this {
    this.orderColumn = column;
    return this;
  }

  limit(): this {
    return this;
  }

  single(): Promise<{ data: unknown; error: null | { message: string } }> {
    return this.handler(this.snapshot(true));
  }

  then<TResult1 = { data: unknown; error: null | { message: string } }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: null | { message: string } }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.handler(this.snapshot(false)).then(onfulfilled, onrejected);
  }

  private snapshot(single: boolean) {
    return {
      table: this.table,
      action: this.action,
      payload: this.payload,
      filters: this.filters,
      orderColumn: this.orderColumn,
      single,
    };
  }
}

function fakeClient(
  handler: ConstructorParameters<typeof FakeQuery>[1],
): SupabaseClientLike {
  return {
    from(table: string) {
      return new FakeQuery(table, handler);
    },
  };
}

describe("supabase tracking repository", () => {
  it("maps challenge rows into domain challenges", async () => {
    const repository = createSupabaseTrackingRepositoryFromClient(
      fakeClient(async ({ table, action, orderColumn }) => {
        expect({ table, action, orderColumn }).toEqual({
          table: "challenges",
          action: "select",
          orderColumn: "sort_order",
        });
        return {
          data: [
            {
              id: "challenge-0001",
              label: "Challenge #1",
              start_title: "Moon",
              target_title: "Gravity",
              ruleset: "ranked_classic",
              sort_order: 1,
              is_active: true,
            },
          ],
          error: null,
        };
      }),
    );

    await expect(repository.listChallenges()).resolves.toEqual([
      {
        id: "challenge-0001",
        label: "Challenge #1",
        sortOrder: 1,
        isActive: true,
        mode: "daily",
        start: { title: "Moon" },
        target: { title: "Gravity" },
        ruleset: "ranked_classic",
        source: "curated",
      },
    ]);
  });

  it("assigns the next challenge number when creating a challenge", async () => {
    const calls: unknown[] = [];
    const repository = createSupabaseTrackingRepositoryFromClient(
      fakeClient(async (query) => {
        calls.push(query);

        if (query.action === "select") {
          return {
            data: [{ sort_order: 1 }],
            error: null,
          };
        }

        expect(query).toMatchObject({
          table: "challenges",
          action: "insert",
          payload: {
            id: "challenge-0002",
            label: "Challenge #2",
            start_title: "Mars",
            target_title: "Water",
            ruleset: "ranked_classic",
            sort_order: 2,
            is_active: true,
          },
          single: true,
        });
        return {
          data: {
            id: "challenge-0002",
            label: "Challenge #2",
            start_title: "Mars",
            target_title: "Water",
            ruleset: "ranked_classic",
            sort_order: 2,
            is_active: true,
          },
          error: null,
        };
      }),
    );

    await expect(
      repository.createChallenge({
        startTitle: "Mars",
        targetTitle: "Water",
      }),
    ).resolves.toMatchObject({
      id: "challenge-0002",
      label: "Challenge #2",
      start: { title: "Mars" },
      target: { title: "Water" },
    });
    expect(calls).toHaveLength(2);
  });

  it("inserts a trimmed display-name player", async () => {
    const repository = createSupabaseTrackingRepositoryFromClient(
      fakeClient(async ({ table, action, payload, single }) => {
        expect({ table, action, payload, single }).toEqual({
          table: "players",
          action: "insert",
          payload: {
            display_name: "Vijay",
            last_seen_at: "2026-07-14T00:00:00.000Z",
          },
          single: true,
        });
        return {
          data: { id: "player-1", display_name: "Vijay" },
          error: null,
        };
      }),
      () => new Date("2026-07-14T00:00:00.000Z"),
    );

    await expect(
      repository.upsertPlayer({ displayName: "  Vijay  " }),
    ).resolves.toEqual({
      id: "player-1",
      displayName: "Vijay",
    });
  });

  it("ranks leaderboard rows from completed runs", async () => {
    const repository = createSupabaseTrackingRepositoryFromClient(
      fakeClient(async ({ table, action, filters }) => {
        expect({ table, action, filters }).toEqual({
          table: "runs",
          action: "select",
          filters: { challenge_id: "challenge-0001", status: "completed" },
        });
        return {
          data: [
            {
              id: "run-slow",
              challenge_id: "challenge-0001",
              player_id: "player-slow",
              elapsed_ms: 6000,
              click_count: 2,
              completed_at: "2026-07-14T00:00:06.000Z",
              player: { display_name: "Slow" },
              path_preview: [],
            },
            {
              id: "run-fast",
              challenge_id: "challenge-0001",
              player_id: "player-fast",
              elapsed_ms: 4000,
              click_count: 3,
              completed_at: "2026-07-14T00:00:04.000Z",
              player: { display_name: "Fast" },
              path_preview: [],
            },
          ],
          error: null,
        };
      }),
    );

    const rows = await repository.listLeaderboard("challenge-0001");

    expect(rows.map((row) => [row.rank, row.displayName])).toEqual([
      [1, "Fast"],
      [2, "Slow"],
    ]);
  });
});
