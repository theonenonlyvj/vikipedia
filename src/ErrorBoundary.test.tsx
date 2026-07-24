import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Bomb(): null {
  throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React logs caught render errors via console.error; keep test output clean.
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders children when nothing throws", () => {
    const report = vi.fn();
    render(
      <ErrorBoundary reporter={{ report }}>
        <p>All good</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("All good")).toBeVisible();
    expect(report).not.toHaveBeenCalled();
  });

  it("renders the fallback and reports via the injected reporter when a child throws", () => {
    const report = vi.fn();
    render(
      <ErrorBoundary reporter={{ report }}>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/something broke on our side/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /reload/i })).toBeVisible();

    expect(report).toHaveBeenCalledTimes(1);
    const [source, error, context] = report.mock.calls[0]!;
    expect(source).toBe("error-boundary");
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("kaboom");
    expect(typeof context?.componentStack).toBe("string");
  });

  it("reloads the page when Reload is clicked", async () => {
    const reloadSpy = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload: reloadSpy });
    const user = userEvent.setup();

    render(
      <ErrorBoundary reporter={{ report: vi.fn() }}>
        <Bomb />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole("button", { name: /reload/i }));

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("RC-06: renders a 'Try again' button beside Reload when a child throws", () => {
    render(
      <ErrorBoundary reporter={{ report: vi.fn() }}>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("button", { name: /try again/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /reload/i })).toBeVisible();
  });

  it("RC-06: 'Try again' resets a transient render error and recovers in place - no reload, no navigation - for a realistic App-state-shaped crash (not just a Bomb that always throws)", async () => {
    // A module-level flag standing in for "some reachable-but-transient
    // impossible app state" (exactly the class of bug this whole council
    // round targets) - NOT a per-render counter, so this genuinely proves a
    // remount happened rather than the component just returning different
    // content on a re-render of the SAME instance.
    let brokenStateStillPresent = true;
    let mountCount = 0;
    function TransientlyBrokenApp() {
      // Lazy initializer only runs on a genuine fresh mount - a recycled
      // fiber surviving the crash would never bump this again.
      const [instance] = useState(() => ++mountCount);
      if (brokenStateStillPresent) {
        throw new Error("reachable impossible state");
      }
      return <p>Recovered, instance {instance}</p>;
    }
    const reloadSpy = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload: reloadSpy });
    const user = userEvent.setup();

    render(
      <ErrorBoundary reporter={{ report: vi.fn() }}>
        <TransientlyBrokenApp />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/something broke on our side/i)).toBeVisible();
    const mountCountAtCrash = mountCount;

    // The underlying condition has since cleared (e.g. a stale ref reset by
    // some other event) - "Try again" is what gives the player a way back
    // without a full page reload.
    brokenStateStillPresent = false;
    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByText(/recovered/i)).toBeVisible();
    expect(mountCount).toBeGreaterThan(mountCountAtCrash);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it("RC-06: repeated 'Try again' taps on a non-transient crash keep landing back on the crash screen without ever reloading", async () => {
    const user = userEvent.setup();
    render(
      <ErrorBoundary reporter={{ report: vi.fn() }}>
        <Bomb />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByText(/something broke on our side/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByText(/something broke on our side/i)).toBeVisible();
  });
});
