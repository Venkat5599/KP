"use client";

import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

const faqs = [
  {
    question: "What is noyeet?",
    answer:
      "A guardrail for onchain agents. Agents do not get keys; they get permits. A guard contract executes the agent's calls, then asserts post-state and reverts if a bound breaks. The permit is only valid while the chain agrees with the consequence.",
  },
  {
    question: "How is this different from calldata-level policies?",
    answer:
      "Calldata-level policies (Turnkey, Safe module roles, session keys) evaluate what the agent claims it will do. Two calls with identical bytes can produce different outcomes. noyeet evaluates the outcome: the invariant is a revert condition inside the transaction itself, so the simulation verdict and the on-chain enforcement are the same code path.",
  },
  {
    question: "Is noyeet a wallet?",
    answer:
      "No. Keys live in KeeperHub's Turnkey enclaves. noyeet never touches key material and cannot move assets by itself. The guard's executor can only move value through executeGuarded, and the guard asserts invariants at inclusion.",
  },
  {
    question: "Is this an MCP server?",
    answer:
      "No. noyeet is a REST gateway plus a Solidity guard. It is built on KeeperHub, which offers its own MCP server for agent-native access; noyeet consumes KeeperHub's API rather than exposing an MCP surface.",
  },
  {
    question: "What happens when the simulation and the chain disagree?",
    answer:
      "If state moves between simulation and inclusion, the guard's assertion at inclusion reverts the transaction atomically. This was demonstrated against the deployed Sepolia guard on a chain fork: the unsafe broadcast mined with status 0 and reverted NOYEET/1:INV:0:1120000000000000000:1400000000000000000, leaving the position unchanged.",
  },
  {
    question: "What is not built yet?",
    answer:
      "The honesty table in the repo README lists it precisely: on-chain receipt anchoring and the keeper live run need the organization's KeeperHub key and a funded executor; Tempo hold-signing and a multi-feed oracle are roadmap items. Nothing in the repo claims otherwise.",
  },
];

const ease = [0.23, 1, 0.32, 1] as const;

export function FAQ(): ReactNode {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease }}
          className="mb-14"
        >
          <h2 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            Everything you need to know
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Honest answers. If a feature does not exist, it says so.
          </p>
        </motion.div>

        <div className="divide-y divide-border border-y border-border">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={faq.question}>
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left"
                >
                  <span className="text-lg font-medium tracking-tight">{faq.question}</span>
                  <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.25, ease }}
                    className="shrink-0 text-muted-foreground"
                  >
                    <ChevronDown className="size-5" aria-hidden="true" />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease }}
                      className="overflow-hidden"
                    >
                      <p className="pb-6 leading-relaxed text-muted-foreground">{faq.answer}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
