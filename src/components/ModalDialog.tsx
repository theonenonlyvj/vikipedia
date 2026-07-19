import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

/**
 * The app's one shared dialog shell (focus trap, Escape-to-close, scroll
 * lock, return-focus-on-close) - originally private to App.tsx (the identity
 * prompt, End Run confirm), now extracted so other app-shell-level dialogs
 * (the teaching gate's "how to play" popup - UX redesign spec) reuse the
 * exact same pattern instead of re-implementing focus management.
 */
export default function ModalDialog({
  busy = false,
  children,
  className,
  onClose,
  returnFocusRef,
  titleId,
}: {
  busy?: boolean;
  children: ReactNode;
  className: string;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  titleId: string;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const focusCycle = useRef(0);

  useEffect(() => {
    const cycle = ++focusCycle.current;
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement && dialogRef.current?.contains(activeElement))) {
      const first = focusableElements(dialogRef.current)[0];
      (first ?? dialogRef.current)?.focus();
    }
    return () => {
      queueMicrotask(() => {
        if (focusCycle.current === cycle && returnFocusRef.current?.isConnected) {
          returnFocusRef.current.focus();
        }
      });
    };
  }, [returnFocusRef]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // PKG-12 (council 2026-07-19, Judge B): inert every sibling of this
  // dialog's own backdrop, generically - not a named list of app-shell
  // classes (`.shell-topbar`/`.content-shell`/`.site-footer`), because
  // those only exist while AppShell is mounted. Both real call sites can
  // also open while RaceFlow is mounted instead (End Run mid-race, the
  // identity dialog from RaceResults' "Claim your spot"), where the
  // sibling is a single `.race-takeover` div - a literal named-class list
  // would be a no-op for exactly the dialog that most needs backgrounding.
  // Walking `.modal-backdrop`'s own DOM siblings covers every mount point
  // through one shared parent, so a virtual-cursor AT can't wander into
  // nav/footer/the frozen race behind the dialog.
  useEffect(() => {
    const backdrop = backdropRef.current;
    const parent = backdrop?.parentElement;
    if (!backdrop || !parent) return;
    // `setAttribute`/`removeAttribute`, not the `.inert` IDL property - the
    // attribute is what real browsers key inert-ness off (the property is
    // just a reflection of it), and it's the only one jsdom's own test
    // environment actually implements here.
    const inerted: HTMLElement[] = [];
    for (const sibling of parent.children) {
      if (sibling === backdrop || !(sibling instanceof HTMLElement) || sibling.hasAttribute("inert")) {
        continue;
      }
      sibling.setAttribute("inert", "");
      inerted.push(sibling);
    }
    return () => {
      for (const sibling of inerted) {
        sibling.removeAttribute("inert");
      }
    };
  }, []);

  function close() {
    if (busy) return;
    onClose();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = focusableElements(dialogRef.current);
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div className="modal-backdrop" ref={backdropRef} role="presentation">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={className}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  );
}

function focusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(
    "button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
  ));
}
