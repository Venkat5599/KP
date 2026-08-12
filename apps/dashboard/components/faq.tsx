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
      "Calldata-level policies evaluate what the agent claims it will do. Two calls with identical bytes can produce different outcomes. noyeet evaluates the outcome: the invariant is a revert condition inside the transaction itself, so the simulation verdict and the on-chain enforcement are the same code path.",
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

function FAQItem({
  faq,
  index,
  isOpen,
  onToggle,
}: {
  faq: (typeof faqs)[0];
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}): ReactNode {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, ease, delay: index * 0.05 }}
      onClick={onToggle}
      className="cursor-pointer rounded-2xl bg-frame p-5 shadow-sm sm:p-6"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      aria-expanded={isOpen}
    >
      <div className="flex w-full items-center justify-between gap-4 text-left">
        <span className="text-base font-medium text-foreground sm:text-lg">
          {faq.question}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3, ease }}
          className="shrink-0"
        >
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        </motion.div>
      </div>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease }}
            className="overflow-hidden"
          >
            <p className="pt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {faq.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function FAQ(): ReactNode {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section className="w-full px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease }}
          className="mb-12 text-center sm:mb-16"
        >
          <span className="text-sm font-medium text-muted-foreground">
            Frequently Asked Questions
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Everything you need to know
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            Can&apos;t find the answer you&apos;re looking for? Reach out!
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <motion.a
              href="#"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center rounded-xl bg-foreground px-6 py-2.5 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
            >
              Open dashboard
            </motion.a>
            <motion.a
              href="#"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center rounded-xl border border-border bg-frame px-6 py-2.5 text-sm font-semibold text-foreground transition-colors"
            >
              Contact Support
            </motion.a>
          </div>
        </motion.div>

        <div className="flex flex-col gap-3" role="list">
          {faqs.map((faq, index) => (
            <FAQItem
              key={index}
              faq={faq}
              index={index}
              isOpen={openIndex === index}
              onToggle={() => handleToggle(index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
