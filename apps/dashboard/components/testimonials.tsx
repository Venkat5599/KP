"use client";

import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect, type ReactNode } from "react";

/**
 * The chain is the witness. No invented people, no fake quotes: each "testimonial"
 * is a real statement the system produced — a live verdict, a mined revert, a test
 * suite result. The carousel UI is the template's; the content is evidence.
 */
const testimonials = [
  {
    quote:
      "NOYEET/1:INV:0:1120000000000000000:1400000000000000000 — a broadcast of the unsafe composite mined with status 0 and left the position unchanged.",
    name: "The guard",
    title: "at inclusion, on Sepolia (fork-proof, chaos-report.md)",
    initials: "INV",
    color: "#9e3d33",
    company: "Sepolia",
  },
  {
    quote:
      "borrowMore(1.5e18): HTTP 200, wouldRevert false, gas 52667. The permit exists only while the chain agrees with the consequence.",
    name: "The live probe",
    title: "KeeperHub simulate: true, per request",
    initials: "200",
    color: "#2f6b4f",
    company: "KeeperHub",
  },
  {
    quote:
      "156 tests, zero failing — 133 TypeScript across the policy VM, receipts, keeperhub adapter, store, gateway, keeper, and verifier; 23 Solidity including invariant fuzzing.",
    name: "The suite",
    title: "bun test packages apps templates · forge test",
    initials: "156",
    color: "#3c5a54",
    company: "Foundry",
  },
  {
    quote:
      "The re-anchor of the same batch with a different policy hash is refused: NOYEET/1:ANCHOR_CONFLICT. A committed batch is permanent, and so is the policy it names.",
    name: "AnchorStore",
    title: "0x3Dc29f2C…4f6b, deployed on Sepolia",
    initials: "A∅",
    color: "#a8762a",
    company: "Turnkey",
  },
];

const companies = ["KeeperHub", "Turnkey", "Sepolia", "Foundry"];

export function Testimonials(): ReactNode {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % testimonials.length);
    }, 10000);

    return () => clearInterval(timer);
  }, []);

  return (
    <section className="w-full bg-frame border-t border-b border-accent/15 px-6 py-32">
      <div className="mx-auto max-w-5xl">
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="mb-16 text-4xl leading-tight font-medium text-neutral-900 sm:text-5xl lg:mb-20 lg:text-6xl dark:text-neutral-50"
        >
          The chain is the witness
        </motion.h2>

        <div className="mb-16 grid gap-8 lg:mb-20 lg:grid-cols-2 lg:gap-12">
          <div className="flex items-center justify-start gap-4 lg:gap-6" role="tablist" aria-label="Statements">
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={index}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{
                  scale: activeIndex === index ? 1.1 : 0.9,
                  opacity: activeIndex === index ? 1 : 0.6,
                }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className="relative"
                role="tab"
                aria-selected={activeIndex === index}
                tabIndex={activeIndex === index ? 0 : -1}
                onClick={() => setActiveIndex(index)}
                style={{ cursor: "pointer" }}
              >
                <div
                  className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full transition-colors duration-500 sm:h-16 sm:w-16 lg:h-20 lg:w-20"
                  style={{
                    backgroundColor:
                      activeIndex === index ? testimonial.color : undefined,
                  }}
                >
                  <span className="font-mono text-sm font-semibold text-white sm:text-base lg:text-lg">
                    {testimonial.initials}
                  </span>
                </div>

                {activeIndex === index && (
                  <svg
                    className="absolute -inset-2 h-[calc(100%+16px)] w-[calc(100%+16px)] -rotate-90"
                    viewBox="0 0 100 100"
                    aria-hidden="true"
                  >
                    <circle
                      cx="50"
                      cy="50"
                      r="48"
                      fill="none"
                      stroke={testimonial.color}
                      strokeWidth="1.5"
                      opacity="0.2"
                    />
                    <motion.circle
                      key={`progress-${activeIndex}`}
                      cx="50"
                      cy="50"
                      r="48"
                      fill="none"
                      stroke={testimonial.color}
                      strokeWidth="1.5"
                      strokeDasharray={`${2 * Math.PI * 48}`}
                      initial={{ strokeDashoffset: 2 * Math.PI * 48 }}
                      animate={{ strokeDashoffset: 0 }}
                      transition={{ duration: 10, ease: "linear" }}
                      strokeLinecap="round"
                    />
                  </svg>
                )}
              </motion.div>
            ))}
          </div>

          <div className="flex flex-col justify-center" role="tabpanel" aria-live="polite">
            <AnimatePresence mode="wait">
              {testimonials[activeIndex] && (
                <motion.div
                  key={activeIndex}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                >
                  <blockquote className="mb-6 font-mono text-lg leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {testimonials[activeIndex].quote}
                  </blockquote>
                  <div className="text-base font-medium text-neutral-900 sm:text-lg dark:text-neutral-100">
                    {testimonials[activeIndex].name},{" "}
                    <span className="text-neutral-600 dark:text-neutral-400">
                      {testimonials[activeIndex].title}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center justify-between gap-6 lg:gap-8">
          {companies.map((company, index) => {
            const isActive = testimonials[activeIndex]?.company === company;
            return (
              <motion.div
                key={company}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                animate={{ scale: isActive ? 1.1 : 1 }}
                className="flex items-center"
              >
                <span
                  className={`font-mono text-sm font-medium transition-all duration-300 sm:text-base ${
                    isActive ? "opacity-100" : "opacity-30 hover:opacity-60"
                  }`}
                >
                  {company}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
