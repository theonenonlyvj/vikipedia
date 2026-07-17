export const RUN_EXPIRY_MS = 24 * 60 * 60 * 1000;
export const MAX_RUN_CLICKS = 250;
export const DECISION_TIME_GRACE_MS = 5_000;
// A protocol-2 run isn't a resumable in-progress run until it has this many
// clicks. Sub-threshold runs are transient "ghosts" that findActiveRun hides
// and that startRunV2 auto-abandons to make way for a fresh start.
export const MIN_RESUMABLE_CLICKS = 2;

export interface StartRunV2Input {
  challengeId: string;
  idempotencyKey: string;
}

export interface CreateChallengeV2FingerprintInput {
  startTitle: string;
  startPageId: number;
  startAllowedLinkCount: number;
  targetTitle: string;
  targetPageId: number;
  nominateForDaily?: boolean;
}

export interface CreateChallengeRequestFingerprintInput {
  startTitle: string;
  targetTitle: string;
  nominateForDaily?: boolean;
}

export interface RecordClickV2Input {
  runId: string;
  clientEventId: string;
  expectedStepNumber: number;
  sourceTitle: string;
  sourcePageId: number;
  sourceRevisionId?: number;
  clickedAnchorText: string;
  requestedTitle: string;
  destinationTitle: string;
  destinationPageId: number;
  decisionElapsedMs: number;
  clientObservedAt?: string;
}

export interface AbandonRunV2Input {
  runId: string;
  idempotencyKey: string;
  recoveryProtocolVersion?: 1;
}

export function fingerprintStartRun(input: StartRunV2Input): Promise<string> {
  return sha256(JSON.stringify({ challengeId: input.challengeId }));
}

export function fingerprintCreateChallenge(
  input: CreateChallengeV2FingerprintInput,
): Promise<string> {
  const payload: Record<string, unknown> = {
    startTitle: input.startTitle,
    startPageId: input.startPageId,
    startAllowedLinkCount: input.startAllowedLinkCount,
    targetTitle: input.targetTitle,
    targetPageId: input.targetPageId,
  };
  if (input.nominateForDaily === true) payload.nominateForDaily = true;
  return sha256(JSON.stringify(payload));
}

export function fingerprintCreateChallengeRequest(
  input: CreateChallengeRequestFingerprintInput,
): Promise<string> {
  const payload: Record<string, unknown> = {
    startTitle: input.startTitle.trim(),
    targetTitle: input.targetTitle.trim(),
  };
  if (input.nominateForDaily === true) payload.nominateForDaily = true;
  return sha256(JSON.stringify(payload));
}

export async function legacyCreateOperationKey(
  accountId: string,
  input: CreateChallengeRequestFingerprintInput,
): Promise<string> {
  const fingerprint = await sha256(JSON.stringify({
    accountId: accountId.trim(),
    startTitle: input.startTitle.trim(),
    targetTitle: input.targetTitle.trim(),
  }));
  return `legacy-create:${fingerprint}`;
}

export function fingerprintRunClick(input: RecordClickV2Input): Promise<string> {
  return sha256(JSON.stringify({
    runId: input.runId,
    clientEventId: input.clientEventId,
    expectedStepNumber: input.expectedStepNumber,
    sourceTitle: input.sourceTitle,
    sourcePageId: input.sourcePageId,
    sourceRevisionId: input.sourceRevisionId ?? null,
    clickedAnchorText: input.clickedAnchorText,
    requestedTitle: input.requestedTitle,
    destinationTitle: input.destinationTitle,
    destinationPageId: input.destinationPageId,
    decisionElapsedMs: input.decisionElapsedMs,
    clientObservedAt: input.clientObservedAt ?? null,
  }));
}

export function fingerprintAbandonRun(input: AbandonRunV2Input): Promise<string> {
  return sha256(JSON.stringify({
    runId: input.runId,
    recoveryProtocolVersion: input.recoveryProtocolVersion ?? null,
  }));
}

export function clickOperationKey(runId: string, clientEventId: string): string {
  return `click:${runId}:${clientEventId}`;
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
