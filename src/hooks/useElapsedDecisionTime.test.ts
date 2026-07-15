import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useElapsedDecisionTime } from "./useElapsedDecisionTime";

describe("useElapsedDecisionTime", () => {
  it("counts only active decision time and freezes while syncing", () => {
    let now = 1_000;
    const { result, rerender, unmount } = renderHook(
      ({ active }) => useElapsedDecisionTime({ active, now: () => now }),
      { initialProps: { active: false } },
    );

    expect(result.current.elapsedMs).toBe(0);
    rerender({ active: true });
    now = 2_250;
    act(() => result.current.refresh());
    expect(result.current.elapsedMs).toBe(1_250);

    rerender({ active: false });
    now = 9_000;
    act(() => result.current.refresh());
    expect(result.current.elapsedMs).toBe(1_250);
    unmount();
  });

  it("cleans up its interval on terminal transitions and unmount", () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const { rerender, unmount } = renderHook(
      ({ active }) => useElapsedDecisionTime({ active }),
      { initialProps: { active: true } },
    );

    rerender({ active: false });
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not update React state from unmount cleanup and freezes terminal time", () => {
    let now = 100;
    const setStateError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result, rerender, unmount } = renderHook(
      ({ active }) => useElapsedDecisionTime({ active, now: () => now }),
      { initialProps: { active: true } },
    );
    now = 350;
    rerender({ active: false });
    expect(result.current.readElapsed()).toBe(250);
    const frozen = result.current.elapsedMs;
    now = 1_000;
    unmount();
    expect(frozen).toBe(250);
    expect(setStateError).not.toHaveBeenCalled();
  });
});
