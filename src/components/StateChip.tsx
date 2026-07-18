import { deriveChallengeStateChip } from "../domain/challengeCard";
import type { ChallengeOutcomeEntry } from "../domain/types";

/**
 * Browse's per-card state chip (Increment 5, UX redesign spec §Challenges:
 * "a state chip per invariant 2 (`NEW` / `✓ 0:42·6clk` / `DNF`)"). Pure
 * render wrapper over `deriveChallengeStateChip` - see that function's doc
 * comment for the precedence rules. Callers gate rendering this component at
 * all on "there's a session" (spec: "Anonymous/no-session: no chips") -
 * `outcome: undefined` here means "no eligible run on this challenge," not
 * "anonymous."
 */
export default function StateChip({
  outcome,
}: {
  outcome: ChallengeOutcomeEntry | undefined;
}) {
  const chip = deriveChallengeStateChip(outcome);
  return (
    <span className={`state-chip state-chip-${chip.kind}`}>{chip.label}</span>
  );
}
