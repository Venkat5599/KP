"use client";

import { LogoLoop, type LogoItem } from "@/components/logo-loop";
import { ArrowDownRight } from "lucide-react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { useRef, type ReactNode, type MouseEvent } from "react";
import { heroConfig } from "@/lib/config";

const ease = [0.23, 1, 0.32, 1] as const;

const fadeInUp = {
  hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const fadeInScale = {
  hidden: { opacity: 0, scale: 0.95, filter: "blur(8px)" },
  visible: { opacity: 1, scale: 1, filter: "blur(0px)" },
};

/**
 * The "logos" are the real stack: no fake company marks, just the actual
 * infrastructure noyeet is built on.
 */
const logos: LogoItem[] = [
  { node: <span className="font-mono text-sm font-medium">KeeperHub</span> },
  { node: <span className="font-mono text-sm font-medium">Turnkey</span> },
  { node: <span className="font-mono text-sm font-medium">Sepolia</span> },
  { node: <span className="font-mono text-sm font-medium">Foundry</span> },
  { node: <span className="font-mono text-sm font-medium">Solidity</span> },
  { node: <span className="font-mono text-sm font-medium">TypeScript</span> },
  { node: <span className="font-mono text-sm font-medium">Etherscan</span> },
  { node: <span className="font-mono text-sm font-medium">Vercel</span> },
];

const PARALLAX_INTENSITY = 20;

export function Hero(): ReactNode {
  const sectionRef = useRef<HTMLElement>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 25, stiffness: 150 };
  const x = useSpring(mouseX, springConfig);
  const y = useSpring(mouseY, springConfig);

  const handleMouseMove = (e: MouseEvent<HTMLElement>) => {
    if (!sectionRef.current) return;
    if (window.innerWidth < 850) return;

    const rect = sectionRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const offsetX = (e.clientX - centerX) / (rect.width / 2);
    const offsetY = (e.clientY - centerY) / (rect.height / 2);

    mouseX.set(offsetX * PARALLAX_INTENSITY);
    mouseY.set(offsetY * PARALLAX_INTENSITY);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <section
      ref={sectionRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative overflow-hidden px-6 pt-32 pb-20 md:pt-40 md:pb-28"
    >
      <motion.div
        style={{ x, y }}
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(124,168,159,0.14),transparent_55%)]" />
      </motion.div>

      <div className="relative mx-auto max-w-6xl">
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.6, ease }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-4 py-1.5 text-sm text-muted-foreground"
        >
          <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          {heroConfig.badge}
        </motion.div>

        <motion.h1
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.7, ease, delay: 0.05 }}
          className="max-w-3xl text-5xl font-semibold tracking-tighter text-balance sm:text-6xl md:text-7xl"
        >
          {heroConfig.headline.line1} <br />
          {heroConfig.headline.line2} <span className="italic text-accent">{heroConfig.headline.accent}</span>
        </motion.h1>

        <motion.p
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.7, ease, delay: 0.12 }}
          className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground"
        >
          {heroConfig.subheadline}
        </motion.p>

        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.7, ease, delay: 0.18 }}
          className="mt-10 flex flex-wrap items-center gap-4"
        >
          <a
            href={heroConfig.cta.href}
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-85"
          >
            {heroConfig.cta.text}
            <ArrowDownRight className="size-4" aria-hidden="true" />
          </a>
          <a
            href="https://github.com/Venkat5599/KP"
            className="inline-flex items-center rounded-full border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-foreground/5"
          >
            Read the repo
          </a>
        </motion.div>
      </div>

      <motion.div
        variants={fadeInScale}
        initial="hidden"
        animate="visible"
        transition={{ duration: 0.8, ease, delay: 0.3 }}
        className="relative mx-auto mt-24 max-w-6xl"
      >
        <LogoLoop logos={logos} speed={60} logoHeight={32} className="opacity-70" />
      </motion.div>
    </section>
  );
}
