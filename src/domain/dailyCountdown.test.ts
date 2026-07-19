import { describe, expect, it } from "vitest";
import { formatCountdown, msUntilNextCentralDrop } from "./dailyCountdown";

describe("msUntilNextCentralDrop", () => {
  it("counts down to today's 5:00 AM Central drop while still ahead of it", () => {
    // 2026-07-19T09:59:59Z is 4:59:59 AM Central (CDT, UTC-5 in July).
    expect(msUntilNextCentralDrop(new Date("2026-07-19T09:59:59.000Z"))).toBe(1_000);
  });

  it("wraps to tomorrow's drop once today's has already passed", () => {
    // 2026-07-19T10:00:01Z is 5:00:01 AM Central - 1s past the drop, so
    // almost the full 24h remains until the NEXT drop.
    expect(msUntilNextCentralDrop(new Date("2026-07-19T10:00:01.000Z"))).toBe(86_399_000);
  });

  it("stays correct across the US spring-forward transition (2026-03-08, Central skips 2:00-3:00 AM), including BEFORE the jump (PKG-07 remainder fix)", () => {
    // 1:00 AM CST, BEFORE the jump - the real 5:00 AM CDT drop is 3 real
    // hours away (07:00Z now -> 10:00Z drop), not 4h. A wall-clock-delta
    // calculation gets this wrong: "seconds since Central midnight" reads
    // 1:00 now and 5:00 for the drop, a 4h wall-clock gap - but the clock
    // itself skips an hour at 2 AM that day, so only 3 real hours actually
    // separate the two instants. This was the enshrined-wrong case the
    // previous version of this test asserted (4h) before the fix.
    expect(msUntilNextCentralDrop(new Date("2026-03-08T07:00:00.000Z"))).toBe(3 * 3_600_000);
    // 4:00 AM CDT, AFTER the jump - offset is now UTC-5; this instant and
    // the drop are both on the post-transition side, so the naive
    // wall-clock-delta calculation happens to agree with the real duration
    // here (1h) regardless of which implementation is used - this alone
    // never would have caught the bug above.
    expect(msUntilNextCentralDrop(new Date("2026-03-08T09:00:00.000Z"))).toBe(1 * 3_600_000);
  });

  it("stays correct across the US fall-back transition (2026-11-01), including BEFORE the jump (PKG-07 remainder fix)", () => {
    // 3:00 AM CST, after the fall-back (America/Chicago has already
    // resumed standard time by mid-morning UTC on the transition day) - both
    // instants post-transition, so this alone wouldn't have caught the bug
    // either (same reasoning as the post-jump spring-forward case above).
    expect(msUntilNextCentralDrop(new Date("2026-11-01T09:00:00.000Z"))).toBe(2 * 3_600_000);
    // 12:30 AM CDT (05:30Z), BEFORE the fall-back - the real 5:00 AM CST
    // drop (after the repeated hour) is 5.5 real hours away (05:30Z now ->
    // 11:00Z drop: CST is UTC-6, so 5:00 AM CST = 11:00Z), not the 4.5h a
    // wall-clock-delta calculation would compute ("seconds since midnight"
    // reads 0:30 now vs. 5:00 for the drop, a 4.5h wall-clock gap - but an
    // extra real hour elapses during the repeated 1:00-1:59 AM hour that
    // day, which the wall-clock delta can't see).
    expect(msUntilNextCentralDrop(new Date("2026-11-01T05:30:00.000Z"))).toBe(5.5 * 3_600_000);
  });

  it("rejects an invalid date, matching centralDateKey's own convention", () => {
    expect(() => msUntilNextCentralDrop(new Date(Number.NaN))).toThrow(
      "A valid date is required.",
    );
  });
});

describe("formatCountdown", () => {
  it("formats sub-hour remainders as M:SS, matching the ratified mockup's '1:23 left today'", () => {
    expect(formatCountdown(83_000)).toBe("1:23 left today");
    expect(formatCountdown(5_000)).toBe("0:05 left today");
  });

  it("formats hour-plus remainders as H:MM:SS", () => {
    expect(formatCountdown(3_661_000)).toBe("1:01:01 left today");
    expect(formatCountdown(13 * 3_600_000 + 47 * 60_000 + 22_000)).toBe("13:47:22 left today");
  });

  it("floors a negative/invalid remainder to a zero readout rather than a negative one", () => {
    expect(formatCountdown(-500)).toBe("0:00 left today");
  });
});
