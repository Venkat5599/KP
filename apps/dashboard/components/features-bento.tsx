"use client";

import { motion, type Transition } from "motion/react";
import { ShieldCheck, FileLock2, Scale, Timer, Radar, BadgeCheck } from "lucide-react";
import type { ReactNode } from "react";

const EASE = [0.23, 1, 0.32, 1] as const;

const cardAnimation = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-100px" },
};

const getCardTransition = (delay = 0): Transition => ({
  duration: 0.8,
  ease: EASE,
  delay,
});

/**
 * The six things noyeet actually does. Every claim maps to a tested module in the
 * repo; nothing here is aspirational.
 */
const features = [
  {
    icon: ShieldCheck,
    title: "Guard contract",
    description:
      "NoYeetGuard executes the agent's calls, then asserts post-state on chain and reverts if a bound breaks. Verified on Etherscan, fuzzed with 1,024 runs.",
    tag: "Solidity · Foundry",
  },
  {
    icon: Scale,
    title: "Policy VM",
    description:
      "A pure TypeScript decision engine: 12 rules, three verdicts, zero I/O. The CI purity gate fails the build on any clock, env, or filesystem access.",
    tag: "12 rules · purity-gated",
  },
  {
    icon: Timer,
    title: "HOLD, not just yes/no",
    description:
      "Legal but unusual intents escalate to a human gate with the consequence already computed. Released on approval, cancelled on decision, never broadcast while held.",
    tag: "three-state authorization",
  },
  {
    icon: FileLock2,
    title: "Receipts",
    description:
      "Every decision, including refusals, produces a canonical receipt: RFC 8785 JSON, keccak256 digest, Merkle-batched in deterministic hourly batches.",
    tag: "verifiable by a third party",
  },
  {
    icon: Radar,
    title: "Keeper",
    description:
      "A continuous executor loop: reads a position over RPC, builds a rebalance intent, submits it through the gateway. No key, just permits.",
    tag: "runs through the gateway",
  },
  {
    icon: BadgeCheck,
    title: "Verifier",
    description:
      "A static, stateless verifier recomputes a receipt's digest in the browser. No server to trust: verification is the bytes, not an opinion.",
    tag: "ships static and stateless",
  },
];

function FeatureCard({
  feature,
  index,
}: {
  feature: (typeof features)[number];
  index: number;
}): ReactNode {
  const Icon = feature.icon;
  return (
    <motion.article
      {...cardAnimation}
      transition={getCardTransition(index * 0.08)}
      className="group relative overflow-hidden rounded-3xl border border-border/70 bg-background/60 p-8 transition-colors hover:border-border"
    >
      <div className="mb-6 inline-flex size-11 items-center justify-center rounded-2xl bg-foreground text-background">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <h3 className="text-xl font-semibold tracking-tight">{feature.title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
      <p className="mt-5 font-mono text-xs text-muted-foreground/70">{feature.tag}</p>
    </motion.article>
  );
}

export function FeaturesBento(): ReactNode {
  return (
    <section id="guard" className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <motion.div
          {...cardAnimation}
          transition={getCardTransition()}
          className="mb-16 max-w-2xl"
        >
          <h2 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            Guardrails that evaluate consequences, not calldata
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Calldata is what the agent claims it will do. The guard checks what the chain
            says will happen, then enforces the same assertion at inclusion.
          </p>
        </motion.div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <FeatureCard key={feature.title} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
