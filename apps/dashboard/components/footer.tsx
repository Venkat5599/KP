"use client";

import { ArrowRight, Github } from "lucide-react";
import { siteConfig } from "@/lib/config";
import type { ReactNode } from "react";

const footerLinks = {
  repo: [
    { label: "README", href: "https://github.com/Venkat5599/KP" },
    { label: "Threat model", href: "https://github.com/Venkat5599/KP/blob/main/docs/threat-model.md" },
    { label: "Chaos report", href: "https://github.com/Venkat5599/KP/blob/main/docs/chaos-report.md" },
    { label: "Checklist", href: "https://github.com/Venkat5599/KP/blob/main/docs/PRODUCTION_CHECKLIST.md" },
  ],
  chain: [
    {
      label: "Guard on Etherscan",
      href: `${siteConfig.explorer}/address/${siteConfig.guardAddress}`,
    },
    {
      label: "Guard deployment tx",
      href: `${siteConfig.explorer}/tx/0x75a17782e2bf0f266854891c8a40bc0a75de38a82d2346a1605391e5c4a5e13f`,
    },
    {
      label: "AnchorStore on Etherscan",
      href: `${siteConfig.explorer}/address/0x3Dc29f2C35f2840D9c7503c66dD3d0Cd468c4f6b`,
    },
    {
      label: "Agent transfer",
      href: `${siteConfig.explorer}/tx/0xf2a08944a35b01174a06f620860dd3c21215f80bff996cec1fe27ba59caa2477`,
    },
  ],
};

export function Footer(): ReactNode {
  return (
    <footer className="border-t border-border px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <p className="text-2xl font-semibold tracking-tight">{siteConfig.name}</p>
            <p className="mt-3 max-w-sm leading-relaxed text-muted-foreground">
              {siteConfig.description}
            </p>
            <a
              href={siteConfig.github}
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5"
            >
              <Github className="size-4" aria-hidden="true" />
              Venkat5599/KP
            </a>
          </div>

          <div>
            <p className="mb-4 text-sm font-semibold">Repo</p>
            <ul className="space-y-3">
              {footerLinks.repo.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                    <ArrowRight className="size-3" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-4 text-sm font-semibold">On chain</p>
            <ul className="space-y-3">
              {footerLinks.chain.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                    <ArrowRight className="size-3" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-2 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{siteConfig.name}. MIT licensed. Built for the KeeperHub hackathon.</p>
          <p className="font-mono text-xs">
            guard {siteConfig.guardAddress.slice(0, 10)}… on Sepolia
          </p>
        </div>
      </div>
    </footer>
  );
}
