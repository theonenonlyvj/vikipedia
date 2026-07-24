import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StagedLoadingNotice from "./StagedLoadingNotice";

describe("StagedLoadingNotice", () => {
  it("renders nothing before 300ms, honest 'Loading…' copy at 300ms, and never a Retry before stalling", () => {
    vi.useFakeTimers();
    try {
      render(<StagedLoadingNotice active pendingLabel="Loading board…" />);
      expect(screen.queryByText(/loading board/i)).toBeNull();

      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.getByText(/loading board/i)).toBeVisible();
      expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("escalates to 'Still working on it…' plus Retry at 2000ms, which calls onRetry", async () => {
    vi.useFakeTimers();
    try {
      const onRetry = vi.fn();
      render(
        <StagedLoadingNotice active onRetry={onRetry} pendingLabel="Loading board…" />,
      );

      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      expect(screen.getByText(/still working on it/i)).toBeVisible();
      const retryButton = screen.getByRole("button", { name: /retry/i });

      act(() => {
        retryButton.click();
      });
      expect(onRetry).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders nothing at all when inactive", () => {
    render(<StagedLoadingNotice active={false} pendingLabel="Loading board…" />);
    expect(screen.queryByText(/loading board/i)).toBeNull();
  });

  it("honors injected thresholds instead of the 300ms/2000ms defaults", () => {
    vi.useFakeTimers();
    try {
      render(
        <StagedLoadingNotice
          active
          pendingLabel="Loading board…"
          thresholds={{ showAfterMs: 10, escalateAfterMs: 20 }}
        />,
      );
      act(() => {
        vi.advanceTimersByTime(10);
      });
      expect(screen.getByText(/loading board/i)).toBeVisible();
      act(() => {
        vi.advanceTimersByTime(10);
      });
      expect(screen.getByText(/still working on it/i)).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });
});
