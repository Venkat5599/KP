"use client";

import { ArrowRight } from "lucide-react";
import { siteConfig } from "@/lib/config";
import type { ReactNode } from "react";

const footerLinks = {
  menu: [
    { label: "Dapp", href: "/execute" },
    { label: "Guard", href: "/#guard" },
    { label: "Mechanism", href: "/#mechanism" },
    { label: "FAQ", href: "/#faq" },
  ],
  repo: [
    { label: "README", href: "https://github.com/Venkat5599/KP" },
    { label: "Threat model", href: "https://github.com/Venkat5599/KP/blob/main/docs/threat-model.md" },
    { label: "Chaos report", href: "https://github.com/Venkat5599/KP/blob/main/docs/chaos-report.md" },
    { label: "Checklist", href: "https://github.com/Venkat5599/KP/blob/main/docs/PRODUCTION_CHECKLIST.md" },
  ],
  social: [
    { label: "GitHub", href: "https://github.com/Venkat5599/KP" },
    {
      label: "Guard on Etherscan",
      href: `${siteConfig.explorer}/address/${siteConfig.guardAddress}`,
    },
  ],
};

export function Footer(): ReactNode {
  return (
    <footer className="relative pt-38 mt-24 mx-2.5 max-[850px]:mx-0">
      <div className="absolute left-1/2 -translate-x-1/2 top-0 w-full max-w-5xl">
        <div className="relative w-full rounded-3xl overflow-hidden shadow-2xl/15">
          <div
            className="absolute inset-0 bg-center bg-no-repeat brightness-150 blur scale-125"
            style={{ backgroundImage: "url(/BG.jpg)", backgroundSize: "150%" }}
            aria-hidden="true"
          />

          <div className="relative z-10 flex flex-col items-center text-center px-12 py-24 max-[850px]:px-6 max-[850px]:py-6 max-[850px]:pt-12">
            <h2 className="text-6xl max-[850px]:text-3xl text-black font-medium tracking-tight max-w-2xl mb-14 max-[850px]:mb-8">
              Run a guarded transaction in one command
            </h2>

            <div className="flex items-center w-full max-w-md justify-center">
              <a
                href="/execute"
                className="flex items-center justify-center gap-2 px-6 py-3 bg-neutral-900 text-white rounded-xl text-sm font-medium transition-opacity hover:opacity-90 whitespace-nowrap max-[850px]:w-full max-[850px]:py-3"
              >
                Open the live dapp
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-accent rounded-tr-[3rem] rounded-tl-[3rem] pt-96 pb-16 max-[850px]:pt-72">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-start justify-between gap-12 max-[850px]:flex-col max-[850px]:gap-10">
            <a href="/" className="flex items-center gap-2" aria-label="noyeet home">
              <div className="w-8 h-8 rounded-full bg-neutral-900" />
              <span className="text-xl font-semibold text-neutral-900 leading-0">noyeet</span>
            </a>

            <nav className="flex gap-16 max-[850px]:gap-10 max-[850px]:flex-wrap" aria-label="Footer navigation">
              <div>
                <h3 className="text-xs font-medium text-neutral-900/50 uppercase tracking-wider mb-4">Menu</h3>
                <ul className="space-y-2">
                  {footerLinks.menu.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className="text-sm text-neutral-900 hover:text-neutral-900/70 transition-colors">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-xs font-medium text-neutral-900/50 uppercase tracking-wider mb-4">Repo</h3>
                <ul className="space-y-2">
                  {footerLinks.repo.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className="text-sm text-neutral-900 hover:text-neutral-900/70 transition-colors">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-xs font-medium text-neutral-900/50 uppercase tracking-wider mb-4">On chain</h3>
                <ul className="space-y-2">
                  {footerLinks.social.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className="text-sm text-neutral-900 hover:text-neutral-900/70 transition-colors">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </nav>
          </div>

          <div className="mt-16 pt-6">
            <p className="text-sm text-neutral-900/50 text-center">
              © {new Date().getFullYear()} noyeet. MIT licensed. Built for the KeeperHub
              hackathon. Guard {siteConfig.guardAddress.slice(0, 10)}… on Sepolia.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
