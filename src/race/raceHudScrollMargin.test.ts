import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// Ambient types for the two Node builtins above: see ./node-builtins.d.ts.

/**
 * Ghost-HUD hotfix regression guard (2026-07-19).
 *
 * jsdom doesn't run real layout, so nothing in App.test.tsx can see that
 * `.race-hud` (position: sticky) was visually pinned on top of
 * `.path-strip`, burying the always-on `.run-metrics` timer/clicks row
 * ("0:0X · X clk", PKG-02) as a near-invisible ghost bleeding through
 * path-strip's translucent, blurred surface - live prod screenshots caught
 * it, no unit test did.
 *
 * The bug: WikipediaArticlePanel's mount effect (RaceMode.tsx) calls
 * `heading.scrollIntoView({ block: "start" })` on every article, including
 * the first. `.article-heading h2`'s `scroll-margin-top` is what tells that
 * scroll how much clearance to leave above the heading for the sticky
 * race-hud + the static (non-sticky) path-strip beneath it. It was tuned
 * (56023ef/dd0b2f4) against an older, shorter race-hud and never
 * re-measured after PKG-02 added the always-visible run-metrics row -
 * 132px/176px only cleared race-hud alone, not race-hud + path-strip + the
 * two 14px `.race-mode` grid gaps between them.
 *
 * This can't assert real pixel layout, but it CAN assert the fix doesn't
 * silently regress back toward those undersized values - live-measured
 * (Playwright, 320-1440px width, incl. a wrapped long target title) the
 * real clearance needed is ~246px (mobile) / ~266px (desktop); anything
 * below that reopens the overlap.
 */
describe("race HUD scroll-margin-top (ghost-HUD regression guard)", () => {
  // Comments in styles.css (including the doc-comment on this very rule)
  // contain literal `{`/`}` - strip comments first so the naive brace
  // matching below can't be tricked into stopping early.
  const css = readFileSync(join(__dirname, "..", "styles.css"), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  const MIN_SAFE_BASE = 246; // headroom under the live-verified 280px fix
  const MIN_SAFE_MOBILE = 230; // headroom under the live-verified 260px fix

  function scrollMarginTopIn(source: string): number {
    const match = source.match(/scroll-margin-top:\s*(\d+)px/);
    if (!match) {
      throw new Error("expected a scroll-margin-top: <n>px declaration");
    }
    return Number(match[1]);
  }

  it("base `.article-heading h2` rule clears the sticky race-hud + path-strip stack", () => {
    const baseRuleMatch = css.match(/\.article-heading h2 \{[^}]*\}/);
    expect(baseRuleMatch).not.toBeNull();
    const value = scrollMarginTopIn(baseRuleMatch![0]);
    expect(value).toBeGreaterThanOrEqual(MIN_SAFE_BASE);
  });

  it("<=640px `.article-heading h2` override also clears the stack at mobile widths", () => {
    const mobileBlockMatch = css.match(
      /@media \(max-width: 640px\) \{[\s\S]*?\n\}/,
    );
    expect(mobileBlockMatch).not.toBeNull();
    const mobileRuleMatch = mobileBlockMatch![0].match(
      /\.article-heading h2 \{[^}]*\}/,
    );
    expect(mobileRuleMatch).not.toBeNull();
    const value = scrollMarginTopIn(mobileRuleMatch![0]);
    expect(value).toBeGreaterThanOrEqual(MIN_SAFE_MOBILE);
  });
});
