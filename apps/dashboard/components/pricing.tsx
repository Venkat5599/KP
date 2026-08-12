"use client";

import { motion } from "motion/react";
import { Terminal } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Deploy, not pricing. noyeet is open source — the honest equivalent of a pricing
 * section is the exact set of commands that gets a guarded transaction on chain.
 */
const commands = [
  { line: "git clone https://github.com/Venkat5599/KP.git noyeet && cd noyeet", note: "clone" },
  { line: "bun install && cp .env.example .env", note: "install + configure" },
  { line: "bun test packages apps templates", note: "133 tests, no network required" },
  { line: "cd apps/gateway && bun run start", note: "gateway on :3000" },
];

export function Pricing(): ReactNode {
  return (
    <section className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
          className="mb-14 text-center"
        >
          <h2 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            Open source. Run it in four commands.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
            The contract is deployed and verified on Sepolia. The repo builds from a
            clean clone — CI runs typecheck, tests, the purity gate, and the Foundry
            suite on every push.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1], delay: 0.1 }}
          className="overflow-hidden rounded-3xl border border-border bg-background/60"
        >
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <Terminal className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="font-mono text-xs text-muted-foreground">terminal</span>
          </div>
          <div className="space-y-4 p-6">
            {commands.map((command) => (
              <div key={command.line}>
                <code className="block break-all font-mono text-sm">{command.line}</code>
                <p className="mt-1 text-xs text-muted-foreground">{command.note}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
