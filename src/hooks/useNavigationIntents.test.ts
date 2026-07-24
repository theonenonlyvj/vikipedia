import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNavigationIntents, type UseNavigationIntentsOptions } from "./useNavigationIntents";

function setup(overrides: Partial<UseNavigationIntentsOptions> = {}) {
  const challengeLockRef = { current: false };
  const setMode = vi.fn();
  const setChallengesView = vi.fn();
  const setBoardsInitialSegment = vi.fn();
  const setRaceStage = vi.fn();
  const { result } = renderHook(() =>
    useNavigationIntents({
      challengeLockRef,
      setMode,
      setChallengesView,
      setBoardsInitialSegment,
      setRaceStage,
      ...overrides,
    }),
  );
  return { nav: result.current, challengeLockRef, setMode, setChallengesView, setBoardsInitialSegment, setRaceStage };
}

describe("useNavigationIntents", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  describe("goHome", () => {
    it("clears a present ?challenge= param at depth 0 and closes Detail when unlocked", () => {
      window.history.pushState({ vwrDepth: 2 }, "", "/?challenge=challenge-1");
      const { nav, setMode, setChallengesView } = setup();

      nav.goHome();

      expect(window.location.search).toBe("");
      // clearChallengeUrl treats depth 0 as "no marker at all" (falsy) -
      // see its own state-construction comment.
      expect(window.history.state).toEqual({});
      expect(setChallengesView).toHaveBeenCalledWith("browse");
      expect(setMode).toHaveBeenCalledWith("home");
    });

    it("does not clear the URL while locked, even with a ?challenge= param present", () => {
      window.history.pushState({ vwrDepth: 2 }, "", "/?challenge=challenge-1");
      const { nav, challengeLockRef, setChallengesView } = setup();
      challengeLockRef.current = true;

      nav.goHome();

      expect(window.location.search).toBe("?challenge=challenge-1");
      expect(setChallengesView).not.toHaveBeenCalled();
    });

    it("normalizes a stale non-zero ladder depth back to 0 when there's no challenge param", () => {
      window.history.pushState({ vwrDepth: 1 }, "", "/");
      const replaceSpy = vi.spyOn(window.history, "replaceState");
      const { nav } = setup();

      nav.goHome();

      expect(replaceSpy).toHaveBeenCalledWith({}, "", "/");
      replaceSpy.mockRestore();
    });

    it("is a no-op on history state when already at depth 0", () => {
      window.history.replaceState({}, "", "/");
      const pushSpy = vi.spyOn(window.history, "pushState");
      const replaceSpy = vi.spyOn(window.history, "replaceState");
      const { nav } = setup();

      nav.goHome();

      expect(pushSpy).not.toHaveBeenCalled();
      expect(replaceSpy).not.toHaveBeenCalled();
      pushSpy.mockRestore();
      replaceSpy.mockRestore();
    });
  });

  describe("switchMode", () => {
    it("clears a present ?challenge= param at depth 1 (still away from Home)", () => {
      window.history.pushState({ vwrDepth: 2 }, "", "/?challenge=challenge-1");
      const { nav, setMode, setChallengesView } = setup();

      nav.switchMode("you");

      expect(window.location.search).toBe("");
      expect(window.history.state).toEqual({ vwrDepth: 1 });
      expect(setChallengesView).toHaveBeenCalledWith("browse");
      expect(setMode).toHaveBeenCalledWith("you");
    });

    it("pushes a fresh depth-1 entry the first time it leaves depth 0", () => {
      window.history.replaceState({}, "", "/");
      const pushSpy = vi.spyOn(window.history, "pushState");
      const { nav } = setup();

      nav.switchMode("you");

      expect(pushSpy).toHaveBeenCalledWith({ vwrDepth: 1 }, "", "/");
      pushSpy.mockRestore();
    });

    it("replaces in place on a same-depth bounce", () => {
      window.history.pushState({ vwrDepth: 1 }, "", "/");
      const pushSpy = vi.spyOn(window.history, "pushState");
      const replaceSpy = vi.spyOn(window.history, "replaceState");
      const { nav } = setup();

      nav.switchMode("boards");

      expect(pushSpy).not.toHaveBeenCalled();
      expect(replaceSpy).toHaveBeenCalledWith({ vwrDepth: 1 }, "", "/");
      pushSpy.mockRestore();
      replaceSpy.mockRestore();
    });

    it("resets Challenges to Browse and Boards to Today as a side effect", () => {
      const { nav, setChallengesView, setBoardsInitialSegment } = setup();

      nav.switchMode("challenges");
      expect(setChallengesView).toHaveBeenCalledWith("browse");

      nav.switchMode("boards");
      expect(setBoardsInitialSegment).toHaveBeenCalledWith("today");
    });
  });

  describe("openDetail", () => {
    it("pushes the challenge param and lands on Challenges/Detail", () => {
      const { nav, setMode, setChallengesView } = setup();

      nav.openDetail("challenge-2");

      expect(window.location.search).toBe("?challenge=challenge-2");
      expect(window.history.state).toEqual({ vwrDepth: 2 });
      expect(setMode).toHaveBeenCalledWith("challenges");
      expect(setChallengesView).toHaveBeenCalledWith("detail");
    });
  });

  describe("closeDetail", () => {
    it("replaces Detail's own entry down to depth 1 and returns to Browse", () => {
      window.history.pushState({ vwrDepth: 2 }, "", "/?challenge=challenge-2");
      const pushSpy = vi.spyOn(window.history, "pushState");
      const { nav, setChallengesView } = setup();

      nav.closeDetail();

      expect(pushSpy).not.toHaveBeenCalled();
      expect(window.location.search).toBe("");
      expect(window.history.state).toEqual({ vwrDepth: 1 });
      expect(setChallengesView).toHaveBeenCalledWith("browse");
      pushSpy.mockRestore();
    });
  });

  describe("enterRacePreview", () => {
    it("pins the challenge URL and opens the preview stage", () => {
      const { nav, setRaceStage } = setup();

      nav.enterRacePreview("challenge-3");

      expect(window.location.search).toBe("?challenge=challenge-3");
      expect(setRaceStage).toHaveBeenCalledWith("preview");
    });
  });

  describe("exitRaceTo", () => {
    it("clears raceStage and routes home", () => {
      const { nav, setRaceStage, setMode } = setup();

      nav.exitRaceTo("home");

      expect(setRaceStage).toHaveBeenCalledWith(null);
      expect(setMode).toHaveBeenCalledWith("home");
    });

    it("clears raceStage and routes to a non-Home destination via switchMode", () => {
      const { nav, setRaceStage, setMode, setBoardsInitialSegment } = setup();

      nav.exitRaceTo("boards");

      expect(setRaceStage).toHaveBeenCalledWith(null);
      expect(setMode).toHaveBeenCalledWith("boards");
      expect(setBoardsInitialSegment).toHaveBeenCalledWith("today");
    });
  });

  describe("goToBoards", () => {
    it("sets the requested segment, marks in-app mode, and lands on boards", () => {
      const pushSpy = vi.spyOn(window.history, "pushState");
      const { nav, setBoardsInitialSegment, setMode } = setup();

      nav.goToBoards("yesterday");

      expect(setBoardsInitialSegment).toHaveBeenCalledWith("yesterday");
      expect(pushSpy).toHaveBeenCalledWith({ vwrDepth: 1 }, "", "/");
      expect(setMode).toHaveBeenCalledWith("boards");
      pushSpy.mockRestore();
    });
  });

  describe("pinLockedChallenge", () => {
    it("replaces the URL to the given challenge id at depth 2", () => {
      const pushSpy = vi.spyOn(window.history, "pushState");
      const { nav } = setup();

      nav.pinLockedChallenge("challenge-locked");

      expect(pushSpy).not.toHaveBeenCalled();
      expect(window.location.search).toBe("?challenge=challenge-locked");
      expect(window.history.state).toEqual({ vwrDepth: 2 });
      pushSpy.mockRestore();
    });
  });

  it("returns a referentially stable intents object across re-renders", () => {
    const challengeLockRef = { current: false };
    const setMode = vi.fn();
    const setChallengesView = vi.fn();
    const setBoardsInitialSegment = vi.fn();
    const setRaceStage = vi.fn();
    const { result, rerender } = renderHook(() =>
      useNavigationIntents({ challengeLockRef, setMode, setChallengesView, setBoardsInitialSegment, setRaceStage }),
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
