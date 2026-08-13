import { loadConfig } from "@/lib/env";
import { runProbe } from "@/lib/probe";
import { createMetadata } from "@/lib/metadata";
import { shorten } from "@/lib/format";
import { ArrowRight, ShieldCheck, GitBranch, Radio } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "noyeet",
  description:
    "Agents do not get keys. They get permits, decided by what the chain says will happen and enforced atomically when it does.",
  path: "/",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** The landing page: what the system is, with live numbers — then a path to use it. */
export default async function LandingPage(): Promise<ReactNode> {
  const config = loadConfig();
  const probe = await runProbe();
  const results = probe.results ?? [];
  const allowed = results.filter((r) => r.verdict === "ALLOW")[0] ?? null;
  const refused = results.filter((r) => r.verdict === "DENY")[0] ?? null;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border/70 bg-background/80 px-6 backdrop-blur-xl">
        <span className="font-mono text-sm font-semibold tracking-tight">noyeet</span>
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/Venkat5599/KP"
            className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 font-mono text-xs transition-colors hover:bg-border/20"
          >
            <GitBranch className="size-3 text-muted-foreground" aria-hidden="true" />
            Repo
          </a>
          <a
            href="/execute"
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 font-mono text-xs font-medium text-background transition-opacity hover:opacity-85"
          >
            Open dapp
            <ArrowRight className="size-3" aria-hidden="true" />
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-20">
        {/* Hero */}
        <section className="py-16 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <span className={`size-1.5 rounded-full ${probe.live ? "bg-emerald-500" : "bg-red-500"}`} aria-hidden="true" />
            {probe.live ? "live on Sepolia" : "guard unreachable"}
          </p>
          <h1 className="mx-auto mt-6 max-w-2xl font-mono text-3xl font-semibold tracking-tight sm:text-5xl">
            Your agent can&apos;t yeet your money.
          </h1>
          <p className="mx-auto mt-4 max-w-xl font-mono text-sm leading-relaxed text-muted-foreground">
            Agents do not get keys. They get permits — decided by what the chain says
            will happen, enforced atomically when it does. The agent proposes, the
            policy filters, the guard asserts, the chain decides.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="/execute"
              className="inline-flex items-center gap-2 rounded-xl bg-foreground px-5 py-3 font-mono text-sm font-medium text-background transition-opacity hover:opacity-85"
            >
              Execute a transaction
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
            <a
              href="/policy"
              className="inline-flex items-center gap-2 rounded-xl border border-border/70 px-5 py-3 font-mono text-sm text-muted-foreground transition-colors hover:bg-border/20 hover:text-foreground"
            >
              See the policy
            </a>
          </div>
        </section>

        {/* Live verdicts — real, per request */}
        <section className="rounded-2xl border border-border/70 p-5">
          <p className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <Radio className="size-3.5" aria-hidden="true" />
            The guard answers right now
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {allowed !== null ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <p className="font-mono text-[11px] uppercase tracking-widest text-emerald-600">allowed</p>
                <p className="mt-1.5 font-mono text-sm">{allowed.label}</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  gas {allowed.gasEstimate ?? "—"} · HTTP {allowed.httpStatus}
                </p>
              </div>
            ) : null}
            {refused !== null ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                <p className="font-mono text-[11px] uppercase tracking-widest text-red-500">refused</p>
                <p className="mt-1.5 font-mono text-sm">{refused.label}</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {(refused.revertReason ?? "").slice(0, 90)}
                </p>
              </div>
            ) : null}
          </div>
          <p className="mt-3 font-mono text-[11px] text-muted-foreground">
            both simulations run against the live guard on every request — the refusal names the
            invariant that would break
          </p>
        </section>

        {/* Why */}
        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/70 p-5">
            <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 font-mono text-sm font-semibold">Permit, not key</h2>
            <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
              the agent sends an intent; a pure policy engine (12 rules, zero I/O)
              decides before anything touches the chain
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 p-5">
            <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 font-mono text-sm font-semibold">Invariant as revert</h2>
            <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
              the guard executes the calls, then asserts post-state — a broken health
              factor reverts the whole transaction
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 p-5">
            <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 font-mono text-sm font-semibold">Simulate = enforce</h2>
            <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
              prediction and enforcement are the same code path; if state moves
              between them, the transaction reverts instead of doing damage
            </p>
          </div>
        </section>

        {/* How it works */}
        <section className="mt-8 rounded-2xl border border-border/70 p-5">
          <p className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            How an execution happens
          </p>
          <ol className="mt-4 space-y-3 font-mono text-xs">
            <li className="flex gap-3">
              <span className="rounded-lg bg-foreground/5 px-2 py-1 font-mono text-[11px]">1</span>
              <span>
                the agent (or you) submits an intent — borrow more, repay, move value — wrapped in
                <code className="ml-1 rounded bg-foreground/5 px-1">executeGuarded</code>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="rounded-lg bg-foreground/5 px-2 py-1 font-mono text-[11px]">2</span>
              <span>
                the policy filters it; the guard-wrapped composite is simulated against the live chain
              </span>
            </li>
            <li className="flex gap-3">
              <span className="rounded-lg bg-foreground/5 px-2 py-1 font-mono text-[11px]">3</span>
              <span>
                a clean simulation broadcasts the identical composite — the guard enforces the same
                assertion at inclusion, or the transaction reverts
              </span>
            </li>
          </ol>
        </section>
      </main>

      <footer className="border-t border-border/70 px-6 py-4 font-mono text-[11px] text-muted-foreground">
        {config.guardAddress === ""
          ? "no guard configured"
          : `guard ${shorten(config.guardAddress, 8, 6)} · ${config.chainName === "" ? "unconfigured chain" : config.chainName} · transactions on Etherscan`}
      </footer>
    </div>
  );
}
