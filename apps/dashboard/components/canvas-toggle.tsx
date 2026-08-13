"use client";

import { useState, type ReactNode } from "react";

/**
 * The drag-and-drop canvas (react-flow). Kept behind a toggle: the readable view
 * is the default, the canvas is for composing blocks. It loads the deployed
 * policy; a zero-edit round trip is byte-identical to what the gateway runs.
 */
export function CanvasToggle({ children }: { children: ReactNode }): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className="rounded-lg border border-border/70 px-3 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-border/20"
      >
        {open ? "Hide" : "Show"} drag-and-drop canvas
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
