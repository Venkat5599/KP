"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";

/**
 * Theme control.
 *
 * Not a pill sliding a knob between a sun and a moon. That switch is on every generated
 * site, and it also hides what it does behind two ambiguous glyphs. Three labelled options
 * say plainly what each one is, including the system default, which the two-state version
 * cannot express at all.
 *
 * Rendering is deferred until mount because the resolved theme is not known during SSR;
 * marking the current option before hydration would flash the wrong one.
 */
const OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Auto" },
] as const;

export function ThemeSwitch(): ReactNode {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="inline-flex items-center gap-0.5 rounded-lg border border-border p-0.5"
    >
      {OPTIONS.map((option) => {
        const active = mounted && theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            aria-pressed={active}
            className={`rounded-[6px] px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
