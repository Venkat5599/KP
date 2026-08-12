"use client";

import { ThemeSwitch } from "@/components/theme-switch";
import { siteConfig } from "@/lib/config";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const links = [
  { label: "Mechanism", href: "/#mechanism" },
  { label: "Guard", href: "/#guard" },
  { label: "Proof", href: "/#proof" },
  { label: "FAQ", href: "/#faq" },
];

export function Header(): ReactNode {
  const pathname = usePathname();
  const onDashboard = pathname?.startsWith("/dashboard");

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight">{siteConfig.name}</span>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            — your agent can&apos;t yeet your money
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <ThemeSwitch />
          <Link
            href={onDashboard ? siteConfig.github : siteConfig.nav.cta.href}
            className="inline-flex items-center rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-85"
          >
            {onDashboard ? "GitHub" : "Open dashboard"}
          </Link>
        </div>
      </div>
    </header>
  );
}
