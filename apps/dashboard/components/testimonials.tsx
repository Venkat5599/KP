"use client";

import { motion } from "motion/react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { siteConfig } from "@/lib/config";
import type { ReactNode } from "react";

/**
 * On-chain proof. Everything here is a real, verifiable fact: the live probe output
 * shape, the mined fork transaction, the test counts. No testimonials, no invented
 * quotes — the chain is the witness.
 */
const rows = [
  {
    verdict: "ALLOW",
    call: "Rebalance, ending above the floor",
    result: "200 · wouldRevert false · gas 52667",
    tone: "ok",
  },
  {
    verdict: "DENY",
    call: "Rebalance, ending below the floor",
    result: "400 · NOYEET/1:INV:0:1120000000000000000:1400000000000000000",
    tone: "bad",
  },
];

export function Testimonials(): ReactNode {
  return (
    <section id="proof" className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
          className="mb-16 max-w-2xl"
        >
          <h2 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            It works, and the chain is the witness
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Both responses below are live simulations against the deployed guard — run
            them yourself with one curl. The denial names the violated invariant by
            index, with the observed and required values.
          </p>
        </motion.div>

        <div className="grid gap-5 lg:grid-cols-2">
          {rows.map((row, index) => (
            <motion.div
              key={row.verdict}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1], delay: index * 0.08 }}
              className={`rounded-3xl border p-8 ${
                row.tone === "ok" ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"
              }`}
            >
              <div className="mb-4 flex items-center gap-2">
                {row.tone === "ok" ? (
                  <CircleCheck className="size-5 text-emerald-500" aria-hidden="true" />
                ) : (
                  <TriangleAlert className="size-5 text-red-500" aria-hidden="true" />
                )}
                <span className="font-mono text-sm font-semibold">{row.verdict}</span>
              </div>
              <p className="font-medium">{row.call}</p>
              <code className="mt-3 block break-all font-mono text-xs text-muted-foreground">
                {row.result}
              </code>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1], delay: 0.16 }}
          className="mt-8 rounded-3xl border border-border bg-background/60 p-8"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-mono text-sm">curl {siteConfig.url}/api/probe</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Runs both simulations on every request. Nothing cached, nothing replayed.
              </p>
            </div>
            <a
              href={`${siteConfig.explorer}/address/${siteConfig.guardAddress}`}
              className="inline-flex shrink-0 items-center rounded-full bg-foreground px-5 py-2.5 font-mono text-xs text-background transition-opacity hover:opacity-85"
            >
              guard {siteConfig.guardAddress.slice(0, 12)}…
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
