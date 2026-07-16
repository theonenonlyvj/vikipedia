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
});
