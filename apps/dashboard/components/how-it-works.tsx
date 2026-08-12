"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import type { ReactNode } from "react";

const steps = [
  {
    title: "Permit, not key",
    description:
      "The agent sends an intent envelope to the gateway. The policy VM - 12 pure rules, no clock, no I/O - decides ALLOW, HOLD, or DENY. The rationale field is metadata: no rule reads it.",
  },
  {
    title: "Simulate the consequence",
    description:
      "The gateway wraps the intent in executeGuarded and runs it with simulate: true through KeeperHub. A revert means the future is bad, so the transaction is denied before it exists.",
  },
  {
    title: "Broadcast the same composite",
    description:
      "The identical composite is broadcast under an idempotency key. The guard asserts post-state at inclusion, so if state moves between simulation and inclusion, the transaction reverts instead of doing damage.",
  },
];

function StepItem({
  step,
  isLast,
}: {
  step: (typeof steps)[0];
  isLast: boolean;
}): ReactNode {
  return (
    <div className={`relative flex gap-5 ${isLast ? "" : "pb-64"}`}>
      {/*
        A node on the progress line, not an icon in a coloured circle.
        The icons that were here (a calendar for "Permit, not key", a rocket for
        "Broadcast") described nothing about the step; they were decoration in a tile. The
        marker now does the one job it can honestly do, which is showing how far along the
        line this step sits.
      */}
      <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center" aria-hidden="true">
        <span className="h-3.5 w-3.5 rounded-full bg-accent ring-4 ring-background" />
      </div>

      <div className="pt-1">
        <h3 className="text-xl font-semibold text-foreground sm:text-2xl">
          {step.title}
        </h3>
        <p className="mt-2 max-w-sm text-base leading-relaxed text-foreground/60">
          {step.description}
        </p>
      </div>
    </div>
  );
}

export function HowItWorks(): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 0.3", "end 0.7"],
  });

  const lineHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <section
      ref={containerRef}
      className="relative w-full bg-background"
    >
      <div className="mx-auto grid max-w-5xl gap-12 px-6 py-20 sm:py-28 lg:grid-cols-2 lg:gap-20">
        <div className="lg:sticky lg:top-48 lg:h-fit lg:self-start">
          <h2 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            How it works
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-foreground/60">
            Your platform, configured by experts and launched on an{" "}
            <span className="font-medium text-foreground">Enterprise plan</span>
            , ready to grow with you.
          </p>
          <motion.a
            href="#"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="mt-8 inline-flex items-center rounded-xl bg-foreground px-6 py-3 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
          >
            Schedule kickoff
          </motion.a>
        </div>

        <div className="relative">
          <div className="absolute left-6 top-6 h-[calc(100%-6rem)] w-0.5 -translate-x-1/2 bg-foreground/10" aria-hidden="true">
            <motion.div
              style={{ height: lineHeight, willChange: "height" }}
              className="w-full bg-accent"
            />
          </div>

          <ol className="relative list-none p-0 m-0">
            {steps.map((step, index) => (
              <li key={step.title}>
                <StepItem
                  step={step}
                  isLast={index === steps.length - 1}
                />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
