"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ThemeSwitch } from "@/components/theme-switch";

/**
 * Site header.
 *
 * What used to be here was a template nav: Products and Resources dropdowns, a logo
 * pointing at href="#", and a filled "Open dashboard" button that competed with the hero's
 * own call to action. noyeet has no products page and no resources page, so those menus
 * described a site that does not exist, and two buttons for one destination is one button
 * too many. The nav is now the three places a visitor can actually go.
 *
 * The marketing chrome is also wrong on the app route. Someone reading live guard state
 * does not need a landing-page nav bar over it, so /dashboard gets a quieter header with
 * the same wordmark and the same theme control and nothing else.
 *
 * The entrance animates y, never opacity. A reveal that starts at opacity 0 renders an
 * empty header whenever the animation does not fire, and a nav that sometimes is not there
 * is worse than a nav that does not animate.
 */
export function Header(): ReactNode {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const reduce = useReducedMotion();
  const isApp = pathname?.startsWith("/dashboard") === true;

  return (
    <motion.header
      initial={reduce ? false : { y: -96 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={
        isApp
          ? "fixed inset-x-2.5 top-2.5 z-[9998] rounded-2xl border border-border bg-frame max-[850px]:inset-x-0 max-[850px]:top-0 max-[850px]:rounded-none"
          : "fixed left-1/2 top-2.5 z-[9998] w-full max-w-5xl -translate-x-1/2 rounded-b-[2rem] bg-frame max-[1200px]:max-w-2xl max-[850px]:inset-x-0 max-[850px]:left-0 max-[850px]:w-full max-[850px]:max-w-none max-[850px]:translate-x-0 max-[850px]:rounded-none max-[850px]:rounded-b-[2rem]"
      }
    >
      <div
        className={`flex items-center justify-between gap-4 px-6 ${
          isApp ? "h-14" : "h-20 max-[850px]:h-16"
        }`}
      >
        <Link href="/" className="flex items-center gap-2">
          <span aria-hidden className="h-5 w-5 rounded-full bg-foreground" />
          <span className="text-lg font-semibold leading-none text-foreground">noyeet</span>
        </Link>

        <div className="flex items-center gap-2 max-[850px]:hidden">
          {!isApp && (
            <Link
              href="/dashboard"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Dashboard
            </Link>
          )}
          <a
            href="https://github.com/Venkat5599/KP"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            GitHub
          </a>
          <ThemeSwitch />
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          className="hidden h-10 w-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted max-[850px]:flex"
        >
          <Hamburger open={mobileOpen} />
        </button>
      </div>

      {mobileOpen && (
        <div className="hidden border-t border-border px-6 py-4 max-[850px]:block">
          <nav className="grid gap-1">
            {!isApp && (
              <Link
                href="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-muted"
              >
                Dashboard
              </Link>
            )}
            <a
              href="https://github.com/Venkat5599/KP"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg px-3 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-muted"
            >
              GitHub
            </a>
          </nav>
          <div className="mt-3 px-3">
            <ThemeSwitch />
          </div>
        </div>
      )}
    </motion.header>
  );
}

/**
 * Two bars that cross into an x. Drawn rather than imported because it is two rectangles
 * and a rotation, and the transform is what carries the open state.
 */
function Hamburger({ open }: { open: boolean }): ReactNode {
  return (
    <span aria-hidden className="relative block h-4 w-5">
      <span
        className="absolute left-0 block h-[1.5px] w-5 rounded-full bg-current transition-transform duration-300"
        style={{ top: open ? "7px" : "3px", transform: open ? "rotate(45deg)" : "none" }}
      />
      <span
        className="absolute left-0 block h-[1.5px] w-5 rounded-full bg-current transition-transform duration-300"
        style={{ top: open ? "7px" : "11px", transform: open ? "rotate(-45deg)" : "none" }}
      />
    </span>
  );
}
