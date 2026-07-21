import { render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import ModalDialog from "./ModalDialog";

// GX-1: `portal` is an opt-in addition to the app's one shared dialog shell -
// default stays exactly the prior inline-render behavior (every existing
// caller - identity/End Run/teaching-gate/ghost-guard dialogs - relies on
// PKG-12's inert-siblings effect keying off `.modal-backdrop`'s own inline
// DOM parent), `portal` mounts it on `document.body` instead (what
// ChallengePathGraphButton's graph modal now opts into, to escape a
// clip-path'd ancestor's stacking context - see ModalDialog's own doc
// comment for the full mechanism).
function Harness({ portal }: { portal?: boolean }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="host-panel">
      <button ref={triggerRef} type="button">
        trigger
      </button>
      <ModalDialog className="test-dialog" onClose={vi.fn()} portal={portal} returnFocusRef={triggerRef} titleId="t">
        <h2 id="t">Title</h2>
      </ModalDialog>
    </div>
  );
}

describe("ModalDialog", () => {
  it("renders inline (as a descendant of its trigger's own DOM parent) by default", () => {
    const { container } = render(<Harness />);

    const host = container.querySelector(".host-panel");
    expect(host?.querySelector(".modal-backdrop")).not.toBeNull();
  });

  it("portals to document.body when portal is set, escaping the render container entirely", () => {
    const { container } = render(<Harness portal />);

    expect(container.querySelector(".modal-backdrop")).toBeNull();
    const backdrop = document.body.querySelector(":scope > .modal-backdrop");
    expect(backdrop).not.toBeNull();
    expect(screen.getByRole("dialog")).toHaveClass("test-dialog");
  });
});
