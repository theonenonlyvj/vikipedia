import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { useMeasuredHeight } from "./useMeasuredHeight";

// RC-09: jsdom has no real ResizeObserver (see this file's own "degrades"
// test below, which relies on that fact staying true) and no layout engine
// (getBoundingClientRect always reports 0), so this fake is what makes the
// hook's actual update path - the ResizeObserver callback re-measuring and
// re-rendering - exercisable at all.
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  callback: ResizeObserverCallback;
  observed: Element[] = [];
  disconnected = false;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(element: Element) {
    this.observed.push(element);
  }

  unobserve(element: Element) {
    this.observed = this.observed.filter((node) => node !== element);
  }

  disconnect() {
    this.disconnected = true;
    this.observed = [];
  }

  trigger(height: number) {
    this.callback(
      [{ contentRect: { height } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

// Mirrors the real call site (App.tsx's `.identity-form-viewport`): an
// OUTER element carries the animated, hook-driven height while an INNER,
// separately-ref'd element is what's actually measured - never the same
// node, or the hook would just be observing its own last-written value.
function Probe() {
  const { contentRef, height } = useMeasuredHeight<HTMLDivElement>();
  return createElement(
    "div",
    { "data-testid": "wrapper", style: height != null ? { height } : undefined },
    createElement("div", { "data-testid": "content", ref: contentRef }, "content"),
  );
}

describe("useMeasuredHeight", () => {
  let originalResizeObserver: typeof ResizeObserver | undefined;

  beforeEach(() => {
    originalResizeObserver = globalThis.ResizeObserver;
    FakeResizeObserver.instances = [];
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver as typeof ResizeObserver;
  });

  it("observes the mounted content node (not the wrapper it sizes) and disconnects on unmount", () => {
    const { unmount } = render(createElement(Probe));

    const observer = FakeResizeObserver.instances[0];
    expect(observer).toBeDefined();
    expect(observer.observed).toEqual([screen.getByTestId("content")]);
    expect(observer.observed[0]).not.toBe(screen.getByTestId("wrapper"));

    unmount();
    expect(observer.disconnected).toBe(true);
  });

  it("animates the wrapper's height as the observer reports new content sizes", () => {
    render(createElement(Probe));
    const observer = FakeResizeObserver.instances[0];
    const wrapper = screen.getByTestId("wrapper");

    act(() => {
      observer.trigger(240);
    });
    expect(wrapper.style.height).toBe("240px");

    act(() => {
      observer.trigger(96);
    });
    expect(wrapper.style.height).toBe("96px");
  });

  it("degrades to no explicit height (height: auto, no crash) when ResizeObserver is unavailable, e.g. jsdom", () => {
    // @ts-expect-error - simulating the real jsdom default (no global at all).
    delete globalThis.ResizeObserver;

    expect(() => render(createElement(Probe))).not.toThrow();
    expect(screen.getByTestId("wrapper").style.height).toBe("");
  });
});
