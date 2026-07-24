import { Component, type ErrorInfo, type ReactNode } from "react";
import type { ErrorReporter } from "./services/errorReporting";

interface ErrorBoundaryProps {
  reporter: Pick<ErrorReporter, "report">;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.reporter.report("error-boundary", error, {
      componentStack: info.componentStack ?? undefined,
    });
  }

  // RC-06 ("one honest loading/error system", Changes item 5): a lightweight
  // "Try again" beside the existing "Reload" - never a dead end for a
  // transient render error. React's own error-boundary contract already
  // does the real work here: catching an error unmounts/destroys the entire
  // failed subtree (this.props.children, i.e. <App> in main.tsx) BEFORE
  // this component even re-renders with hasError, so flipping hasError back
  // to false swaps a structurally different element (the crash div) back
  // for <App> at the same position - React can't reconcile across that
  // type change, so it mounts a genuinely FRESH <App> instance, not a
  // recycled one with stale internal state. Verified empirically (a
  // useState-tracked instance counter increments across a real catch ->
  // reset cycle with no key trick needed - see this file's own test for a
  // realistic, App-state-shaped crash, not just an always-throwing Bomb).
  // A crash rooted in something a remount genuinely can't fix (corrupted
  // persisted storage, a server-side bug) will simply re-throw right back
  // to this same screen - Reload (an actual page load, refetching
  // everything from scratch) stays the guaranteed-effective escape hatch
  // for that case.
  private handleTryAgain = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="crash-screen" role="alert">
          <p>Something broke on our side.</p>
          <div className="crash-screen-actions">
            <button type="button" onClick={this.handleTryAgain}>
              Try again
            </button>
            <button type="button" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
