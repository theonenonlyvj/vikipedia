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

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="crash-screen" role="alert">
          <p>Something broke on our side.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
