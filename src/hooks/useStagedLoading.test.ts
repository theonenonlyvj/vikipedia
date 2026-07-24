import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useStagedLoading } from "./useStagedLoading";

describe("useStagedLoading", () => {
  it("stays hidden before showAfterMs, shows pending copy, then escalates to stalled - honoring injectable thresholds", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() =>
        useStagedLoading(true, { showAfterMs: 300, escalateAfterMs: 2000 }),
      );
      expect(result.current).toBe("hidden");

      act(() => {
        vi.advanceTimersByTime(299);
      });
      expect(result.current).toBe("hidden");

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current).toBe("pending");

      act(() => {
        vi.advanceTimersByTime(1_699);
      });
      expect(result.current).toBe("pending");

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current).toBe("stalled");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never shows anything for a fetch that resolves (active flips false) before showAfterMs", () => {
    vi.useFakeTimers();
    try {
      const { result, rerender } = renderHook(({ active }) => useStagedLoading(active), {
        initialProps: { active: true },
      });
      expect(result.current).toBe("hidden");

      act(() => {
        vi.advanceTimersByTime(150);
      });
      rerender({ active: false });
      expect(result.current).toBe("hidden");

      // No stray timer should still be armed from the aborted attempt.
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(result.current).toBe("hidden");
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets to hidden and restarts the ladder when active flips true again (a fresh retry)", () => {
    vi.useFakeTimers();
    try {
      const { result, rerender } = renderHook(({ active }) => useStagedLoading(active), {
        initialProps: { active: true },
      });
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      expect(result.current).toBe("stalled");

      rerender({ active: false });
      expect(result.current).toBe("hidden");

      rerender({ active: true });
      expect(result.current).toBe("hidden");
      act(() => {
        vi.advanceTimersByTime(299);
      });
      expect(result.current).toBe("hidden");
    } finally {
      vi.useRealTimers();
    }
  });

  it("defaults to the documented 300ms/2000ms thresholds when none are supplied", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useStagedLoading(true));
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(result.current).toBe("pending");
      act(() => {
        vi.advanceTimersByTime(1_700);
      });
      expect(result.current).toBe("stalled");
    } finally {
      vi.useRealTimers();
    }
  });
});
