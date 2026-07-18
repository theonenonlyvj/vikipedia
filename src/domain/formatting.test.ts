import { describe, expect, it } from "vitest";
import { formatMinutesSeconds, formatTimeAndClicks } from "./formatting";

describe("formatMinutesSeconds", () => {
  it("formats sub-minute durations as 0:ss", () => {
    expect(formatMinutesSeconds(1_500)).toBe("0:01");
    expect(formatMinutesSeconds(38_400)).toBe("0:38");
  });

  it("carries whole minutes and zero-pads seconds", () => {
    expect(formatMinutesSeconds(65_000)).toBe("1:05");
    expect(formatMinutesSeconds(600_000)).toBe("10:00");
  });

  it("floors partial seconds rather than rounding up", () => {
    expect(formatMinutesSeconds(1_999)).toBe("0:01");
  });

  it("clamps negative input to zero instead of throwing", () => {
    expect(formatMinutesSeconds(-50)).toBe("0:00");
  });
});

describe("formatTimeAndClicks", () => {
  it("always renders both time and click count (invariant 1)", () => {
    expect(formatTimeAndClicks(42_000, 6)).toBe("0:42 · 6 clk");
    expect(formatTimeAndClicks(1_500, 1)).toBe("0:01 · 1 clk");
    expect(formatTimeAndClicks(0, 0)).toBe("0:00 · 0 clk");
  });
});
