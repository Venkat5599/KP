"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

/**
 * Operator actions on a held intent. Release broadcasts the held composite
 * (idempotency-keyed on the intent — it can never double-broadcast); cancel
 * resolves it without broadcasting. Both are real POSTs to /v1/holds/:id.
 */
export function HoldActions({ holdId }: { holdId: string }): ReactNode {
  const router = useRouter();
  const [busy, setBusy] = useState<"release" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = (action: "release" | "cancel") => {
    setBusy(action);
    setError(null);
    fetch(`/v1/holds/${encodeURIComponent(holdId)}/${action}`, {
      method: "POST",
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        router.refresh();
      })
      .catch((cause: unknown) => {
        setError((cause as Error).message);
        setBusy(null);
      });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => act("release")}
        className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 font-mono text-[11px] text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
      >
        {busy === "release" ? "Broadcasting…" : "Release"}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => act("cancel")}
        className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-1.5 font-mono text-[11px] text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
      >
        {busy === "cancel" ? "Cancelling…" : "Cancel"}
      </button>
      {error !== null ? <span className="font-mono text-[11px] text-red-500">{error}</span> : null}
    </div>
  );
}
