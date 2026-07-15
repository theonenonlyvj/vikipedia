# Target Preview Design

Date: 2026-07-15
Status: approved for v0 release

## Goal

Before a run starts, give players enough context to recognize the selected
target without exposing the target's full article or changing ranked gameplay.

## Experience

- The pre-start Play view shows a read-only `Target preview` for the selected
  challenge.
- The preview contains the canonical target title, one representative image
  when Wikipedia provides one, the first meaningful lead paragraph, and
  Wikipedia revision/license attribution.
- Internal article links are removed from the preview. The preview is context,
  not a second navigation surface.
- Loading and unavailable states preserve the challenge route and Start action.
- Desktop places the preview beside the challenge catalog. Mobile stacks the
  preview above the catalog without horizontal overflow.
- Starting a run removes the preview before the timer begins. The existing
  article renderer remains the only gameplay surface.
- Selecting another challenge after a completed run clears the prior result,
  path, and article so the new target preview is visible.

## Architecture

The existing sanitized Wikipedia gateway fetches the selected target only while
the controller is idle. A small pure preview extractor parses sanitized HTML and
returns only a lead paragraph and representative image markup. The App owns an
abortable, generation-keyed preview request so stale target responses cannot
overwrite a newer selection.

Preview loading uses a dedicated gateway instance. Starting or resetting a run
clears that gateway and aborts any in-flight preview request, keeping the race
gateway cache and timing lifecycle isolated.

## Failure Handling

- Selection changes abort the prior request.
- A failed preview fetch produces a quiet unavailable message and never blocks
  Start Challenge.
- Page-ID mismatches are rejected when the challenge stores a canonical target
  page ID.
- Preview extraction falls back to text-only when no usable image exists.

## Verification

- Unit tests cover representative image/lead extraction, link removal, and
  empty-content fallback.
- App tests cover target-keyed loading, stale response rejection, non-blocking
  failure, disappearance during play, and completed-run reset on selection.
- Browser QA covers desktop and 390px pre-start layouts plus start transition.
- Existing app, Worker, production build, bundle, audit, and deployment gates
  remain mandatory.
