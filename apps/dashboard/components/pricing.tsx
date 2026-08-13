"use client";

import { motion } from "motion/react";
import { Check, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The pricing UI, reframed honestly: noyeet is open source, so the three "plans"
 * are three real ways to run it. Prices are $0 because they are $0.
 */
const plans = [
  {
    name: "Clone",
    price: 0,
    monthlyPrice: 0,
    description: "Read the code and the evidence",
    features: ["203 tests, zero failing", "Guard verified on Etherscan", "Honesty table: real vs pending", "MIT licensed"],
    popular: false,
    href: "https://github.com/Venkat5599/KP",
    cta: "Open the repo",
  },
  {
    name: "Run",
    price: 0,
    monthlyPrice: 0,
    description: "Gateway, keeper, verifier, dashboard",
    features: ["bun install && bun test", "apps/gateway on :3000", "Live dashboard at /execute", "Static receipt verifier"],
    popular: true,
    href: "/execute",
    cta: "Open the dashboard",
  },
  {
    name: "Deploy",
    price: 0,
    monthlyPrice: 0,
    description: "Your guard, your policy, live anchors",
    features: ["forge create NoYeetGuard", "Policy VM: 12 rules", "AnchorStore per-batch policy hash", "Chaos-fork reproduction script"],
    popular: false,
    href: "https://github.com/Venkat5599/KP#run-it-locally",
    cta: "Read the quickstart",
  },
];

const ease = [0.23, 1, 0.32, 1] as const;

function PricingCard({
  plan,
  index,
}: {
  plan: (typeof plans)[0];
  index: number;
}): ReactNode {
  const isPopular = plan.popular;

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, ease, delay: index * 0.1 }}
      className="relative"
    >
      {isPopular && (
        <div className="absolute -inset-1 rounded-[1.2em] bg-accent" aria-hidden="true" />
      )}

      <div
        className={`relative flex h-full flex-col rounded-2xl bg-frame p-6 sm:p-8 ${
          isPopular ? "" : "border border-border"
        }`}
      >
        {isPopular && (
          <div className="absolute -top-4 left-1/2 -translate-x-1/2">
            <span className="inline-block rounded-full bg-accent px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-black/50">
              Recommended
            </span>
          </div>
        )}

        <h3 className="text-xl font-semibold text-foreground">{plan.name}</h3>

        <div className="mt-4">
          <div className="flex items-end gap-3">
            <span className="text-5xl font-bold tracking-tight text-foreground">
              ${plan.price}
            </span>
            <span className="mb-1 text-sm text-muted-foreground">/forever</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {plan.description}
          </p>
        </div>

        <motion.a
          href={plan.href}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-colors ${
            isPopular
              ? "bg-foreground text-background hover:bg-foreground/90"
              : "bg-muted text-foreground hover:bg-muted/80"
          }`}
        >
          {plan.cta}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </motion.a>

        <div className="mt-8">
          <p className="text-sm font-medium text-muted-foreground">Includes:</p>
          <ul className="mt-4 space-y-3">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-center gap-3">
                <Check className="h-4 w-4 shrink-0 text-foreground" strokeWidth={2.5} />
                <span className="text-sm text-foreground">{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
  );
}

export function Pricing(): ReactNode {
  return (
    <section id="pricing" className="w-full bg-background px-6 py-20 sm:py-28 scroll-mt-24">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease }}
          className="mb-12 text-center sm:mb-16"
        >
          <span className="text-sm font-medium text-muted-foreground">
            Open source
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Three ways to run it, all $0
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
            The contract is deployed and verified; the repo builds from a clean clone.
            Pick a starting point.
          </p>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {plans.map((plan, index) => (
            <PricingCard key={plan.name} plan={plan} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
