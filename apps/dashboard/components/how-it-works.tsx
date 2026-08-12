"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { KeyRound, ScanSearch, Send } from "lucide-react";
import type { ReactNode } from "react";

const steps = [
  {
    icon: KeyRound,
    title: "Permit, not key",
    description:
      "The agent sends an intent envelope to the gateway. The policy VM — 12 pure rules, no clock, no I/O — decides ALLOW, HOLD, or DENY. The rationale field is metadata: no rule reads it.",
    snippet: "policy = { targets, selectors, caps, rateLimit, minInvariants }",
  },
  {
    icon: ScanSearch,
    title: "Simulate the consequence",
    description:
      "The gateway wraps the intent in executeGuarded and runs it with simulate: true through KeeperHub. A revert means the future is bad, so the transaction is denied before it exists.",
    snippet: "simulate(executeGuarded(intent)) // revert => DENY",
  },
  {
    icon: Send,
    title: "Broadcast the same composite",
    description:
      "The identical composite is broadcast under an idempotency key. The guard asserts post-state at inclusion, so if state moves between simulation and inclusion, the transaction reverts instead of doing damage.",
    snippet: "broadcast(executeGuarded(intent)) // same assertion, on chain",
  },
];

function StepItem({
  step,
  isLast,
}: {
  step: (typeof steps)[0];
  isLast: boolean;
}): ReactNode {
  const Icon = step.icon;
  return (
    <div className="relative">
      {!isLast && (
        <div
          className="absolute left-[27px] top-16 h-[calc(100%-4rem)] w-px bg-border"
          aria-hidden="true"
        />
      )}
      <div className="relative flex gap-6">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-background">
          <Icon className="size-6 text-accent" aria-hidden="true" />
        </div>
        <div className="pb-14">
          <h3 className="text-2xl font-semibold tracking-tight">{step.title}</h3>
          <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
            {step.description}
          </p>
          <pre className="mt-5 inline-block rounded-xl border border-border bg-background px-4 py-3 font-mono text-xs text-accent">
            {step.snippet}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function HowItWorks(): ReactNode {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.8", "end 0.5"],
  });
  const lineHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <section id="mechanism" ref={ref} className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
          className="mb-20 max-w-2xl"
        >
          <h2 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            The mechanism
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Prediction and enforcement are the same code path. There is no separate check
            mode that can drift from the enforcement path — a class of bug this design
            cannot have.
          </p>
        </motion.div>

        <div className="relative">
          <motion.div
            style={{ height: lineHeight }}
            className="absolute left-[27px] top-2 w-px bg-gradient-to-b from-accent to-transparent"
            aria-hidden="true"
          />
          <div className="space-y-2">
            {steps.map((step, index) => (
              <StepItem key={step.title} step={step} isLast={index === steps.length - 1} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
