import Link from "next/link";
import type { ReactNode } from "react";
import { PolicyCanvas } from "@/components/canvas/policy-canvas";

/**
 * The hero.
 *
 * The composition is deliberate. The usual arrangement, an eyebrow over a headline over a
 * subtitle over two buttons with a product screenshot parked on the right, is the layout on
 * a thousand homepages, and a screenshot of a builder is a strictly worse thing to show
 * than the builder. So the canvas is not an illustration beside the copy. It is the
 * majority of the first screen, it works on first paint, and the visitor can drag a block
 * before reading a word.
 *
 * There is one call to action, not a filled-plus-outlined pair. If the canvas has not
 * earned the click, a second button will not.
 *
 * The top padding clears the fixed header (80px tall, offset 10px) rather than decorating
 * the page with space. Without it the header sits over the headline and shaves the caps off
 * the first line.
 */
export function Hero(): ReactNode {
  return (
    <section className="border-border border-b px-4 pt-28 pb-14 sm:px-6 lg:px-8 lg:pt-32">
      <div className="mx-auto max-w-[1400px]">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="max-w-2xl">
            <h1 className="text-foreground text-4xl leading-[1.05] font-medium tracking-tight sm:text-5xl lg:text-6xl">
              Your agent cannot
              <br />
              yeet your money.
            </h1>
            <p className="text-muted-foreground mt-5 max-w-[54ch] text-base leading-relaxed">
              Agents get permits, not keys. Compose a policy below and watch the
              guard payload compile as you build it.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="bg-foreground text-background focus-visible:ring-ring focus-visible:ring-offset-background inline-flex w-fit items-center rounded-xl px-5 py-3 text-sm font-medium transition-colors hover:bg-[color-mix(in_oklab,var(--foreground)_86%,var(--accent))] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Open the dashboard
          </Link>
        </div>

        <div className="mt-10">
          <PolicyCanvas variant="compact" />
        </div>
      </div>
    </section>
  );
}
