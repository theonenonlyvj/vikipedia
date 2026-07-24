import { useCallback, useMemo, type MutableRefObject } from "react";
import type { ChallengesView, ModeKey } from "../modes/AppShell";
import type { BoardsSegment } from "../modes/Boards";
import {
  clearChallengeUrl,
  markHomeHistoryState,
  markInAppMode,
  readChallengeIdFromUrl,
  syncChallengeUrl,
} from "../services/urlRouting";

/**
 * RC-07 Step 3: the single place that owns the "`?challenge=` iff Detail-
 * or-locked-race" and Back-ladder-depth invariants (see urlRouting.ts's own
 * doc comments for the invariants themselves) for every APP-INITIATED
 * navigation - as opposed to App.tsx's popstate handler, which REACTS to a
 * browser-driven history change that already happened and, by design,
 * never rewrites the URL/history state itself (see that handler's own
 * comments). Before this hook, the same lock-check + depth-calc +
 * markInAppMode/markHomeHistoryState combination was hand-rolled inline at
 * selectMode and closeChallengeDetail, with the SAME combination repeated
 * in reduced/non-branching form (a bare syncChallengeUrl/markInAppMode
 * call, no lock-check needed since these call sites only ever run while
 * unlocked) at openChallengeDetail, openRacePreviewFor, goToBoardsFor/
 * goToBoardsForToday, createChallengeWithSession,
 * createRandomChallengeWithSession, the locked-challenge-sync effect, and
 * the popstate handler's own locked branch - architecture#6's "duplicated
 * across 4+ call sites" complaint (Judge A amend 2, Judge B amend 4).
 *
 * Deliberately NOT migrated here (tracked, not silently dropped - Judge B
 * amend 4's explicit alternative to migrating everything):
 * - startChallengeWithSession's `syncChallengeUrl(challenge.id)` call pins
 *   the URL for an in-flight race takeover while `mode` stays "home" - a
 *   shape none of the intents below match (they all pair the URL write
 *   with a specific mode/view transition; this one deliberately doesn't
 *   change mode at all). Still routes through the one shared urlRouting.ts
 *   primitive directly; only the mode-intent wrapper is skipped.
 * - exitAdmin's `exitAdminDailiesUrl()` is a DIFFERENT invariant entirely
 *   (the /admin/dailies pathname bypass, not `?challenge=`/ladder depth) -
 *   out of scope for this hook.
 */
export interface UseNavigationIntentsOptions {
  challengeLockRef: MutableRefObject<boolean>;
  setMode: (mode: ModeKey) => void;
  setChallengesView: (view: ChallengesView) => void;
  setBoardsInitialSegment: (segment: BoardsSegment) => void;
  setRaceStage: (stage: "preview" | null) => void;
}

export interface NavigationIntents {
  /** selectMode("home")'s full body. */
  goHome: () => void;
  /** selectMode(nextMode) for every OTHER destination (Stats/Browse/You/Boards). */
  switchMode: (nextMode: Exclude<ModeKey, "home">) => void;
  /** Browse card / Play-another / create(-random) challenge -> that challenge's own Detail. */
  openDetail: (challengeId: string) => void;
  /** Detail's own "<- Challenges" close. */
  closeDetail: () => void;
  /** Home hero / Detail's "Race this" -> the pre-race preview beat. */
  enterRacePreview: (challengeId: string) => void;
  /** Leaving the race takeover (preview cancel, Results' exits) for `dest`. */
  exitRaceTo: (dest: ModeKey) => void;
  /** Home's two bottom-nav-bypass entry points onto Boards. */
  goToBoards: (segment: BoardsSegment) => void;
  /** The locked/recovering-race URL pin, shared by the sync effect and popstate's own locked branch. */
  pinLockedChallenge: (challengeId: string) => void;
}

export function useNavigationIntents(options: UseNavigationIntentsOptions): NavigationIntents {
  const { challengeLockRef, setMode, setChallengesView, setBoardsInitialSegment, setRaceStage } = options;

  // Owner-approved URL policy + Back ladder (item 8) - preserved verbatim
  // from selectMode's own retired inline comment (see this repo's git
  // history for the full prose), just parametrized by destination so both
  // goHome and switchMode share the one implementation.
  const departFromCurrentMode = useCallback((nextMode: ModeKey) => {
    if (!challengeLockRef.current && readChallengeIdFromUrl()) {
      clearChallengeUrl("replace", { depth: nextMode !== "home" ? 1 : 0 });
      // Item 8 interaction fix: a tap AWAY from Detail must also close the
      // Detail view itself, not just clear the URL.
      setChallengesView("browse");
      return;
    }
    if (nextMode !== "home") {
      markInAppMode();
    } else {
      // Adversarial-review fix (2026-07-21, finding 1): landing on Home
      // through a plain nav tap must ALSO normalize away any stale depth
      // left on the current entry from a prior non-Home replace.
      markHomeHistoryState();
    }
  }, [challengeLockRef, setChallengesView]);

  const goHome = useCallback(() => {
    departFromCurrentMode("home");
    setMode("home");
  }, [departFromCurrentMode, setMode]);

  const switchMode = useCallback((nextMode: Exclude<ModeKey, "home">) => {
    departFromCurrentMode(nextMode);
    setMode(nextMode);
    // Tapping the Challenges nav item always returns to its root (Browse).
    if (nextMode === "challenges") setChallengesView("browse");
    // The bottom-nav Boards item is always a cold entry - Today.
    if (nextMode === "boards") setBoardsInitialSegment("today");
  }, [departFromCurrentMode, setMode, setChallengesView, setBoardsInitialSegment]);

  const openDetail = useCallback((challengeId: string) => {
    syncChallengeUrl(challengeId);
    setMode("challenges");
    setChallengesView("detail");
  }, [setMode, setChallengesView]);

  const closeDetail = useCallback(() => {
    setChallengesView("browse");
    // Adversarial-review fix (2026-07-21, finding 1): REPLACE Detail's own
    // entry in place (depth 1) rather than pushing a new bare entry on top
    // of it - see clearChallengeUrl's own doc comment for the full history.
    clearChallengeUrl("replace", { depth: 1 });
  }, [setChallengesView]);

  const enterRacePreview = useCallback((challengeId: string) => {
    syncChallengeUrl(challengeId);
    setRaceStage("preview");
  }, [setRaceStage]);

  const exitRaceTo = useCallback((dest: ModeKey) => {
    setRaceStage(null);
    if (dest === "home") {
      goHome();
    } else {
      switchMode(dest);
    }
  }, [setRaceStage, goHome, switchMode]);

  const goToBoards = useCallback((segment: BoardsSegment) => {
    setBoardsInitialSegment(segment);
    // Owner-approved Back ladder (item 8): a second Home -> non-Home entry
    // point that bypasses the bottom nav - needs the exact same in-app
    // history marker a nav tap's own switchMode sets.
    markInAppMode();
    setMode("boards");
  }, [setBoardsInitialSegment, setMode]);

  const pinLockedChallenge = useCallback((challengeId: string) => {
    syncChallengeUrl(challengeId, "replace");
  }, []);

  return useMemo(() => ({
    goHome,
    switchMode,
    openDetail,
    closeDetail,
    enterRacePreview,
    exitRaceTo,
    goToBoards,
    pinLockedChallenge,
  }), [goHome, switchMode, openDetail, closeDetail, enterRacePreview, exitRaceTo, goToBoards, pinLockedChallenge]);
}
