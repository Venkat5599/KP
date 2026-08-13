"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowLeftRight,
  ArrowUpRight,
  BadgeCheck,
  LayoutGrid,
  Play,
  ShieldCheck,
  Sliders,
  Timer,
} from "lucide-react";

const NAV = [
  { href: "/execute", label: "Execute", icon: Play, match: (path: string) => path.startsWith("/execute") },
  { href: "/policy", label: "Policy", icon: Sliders, match: (path: string) => path.startsWith("/policy") },
  { href: "/overview", label: "Overview", icon: LayoutGrid, match: (path: string) => path.startsWith("/overview") },
  { href: "/guard", label: "Guard", icon: ShieldCheck, match: (path: string) => path.startsWith("/guard") },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight, match: (path: string) => path.startsWith("/transactions") },
  { href: "/holds", label: "Holds", icon: Timer, match: (path: string) => path.startsWith("/holds") },
  { href: "/verifier", label: "Verifier", icon: BadgeCheck, match: (path: string) => path.startsWith("/verifier") },
  { href: "/operations", label: "Operations", icon: Activity, match: (path: string) => path.startsWith("/operations") },
] as const;

export function AppNav({ vertical = false }: { vertical?: boolean }): ReactNode {
  const pathname = usePathname() ?? "/";

  const links = NAV.map((item) => {
    const Icon = item.icon;
    const active = item.match(pathname);
    return (
      <a
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
          vertical ? "" : "shrink-0"
        } ${
          active
            ? "bg-foreground/10 font-medium text-foreground"
            : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        }`}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {item.label}
      </a>
    );
  });

  const repoLink = (
    <a
      href="https://github.com/Venkat5599/KP"
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground ${
        vertical ? "" : "shrink-0"
      }`}
    >
      <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
      Repo
    </a>
  );

  if (!vertical) {
    return (
      <nav className="flex items-center gap-1 overflow-x-auto" aria-label="Sections">
        {links}
        {repoLink}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-1" aria-label="Dapp">
      {links}
      <div className="mt-2">{repoLink}</div>
    </nav>
  );
}
