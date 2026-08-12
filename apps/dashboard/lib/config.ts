/**
 * Site configuration for noyeet.
 *
 * All landing copy is centralized here. Every claim below is either a real on-chain
 * fact or a pointer to one; there is no invented content on this page.
 */

export const siteConfig = {
  name: "noyeet",
  tagline: "Your agent can't yeet your money.",
  description:
    "Agents do not get keys. They get permits, decided by what the chain says will happen and enforced atomically when it does.",

  // URLs
  url: "https://dashboard-nu-two-93-six.vercel.app",
  github: "https://github.com/Venkat5599/KP",
  dashboard: "/dashboard",
  explorer: "https://sepolia.etherscan.io",
  guardAddress: "0x4Bd0501fb1c0dEecaCD3efd50340Cd82Bb8E7F0f",

  // Navigation
  nav: {
    cta: {
      text: "Open dashboard",
      href: "/dashboard",
    },
    signIn: {
      text: "GitHub",
      href: "https://github.com/Venkat5599/KP",
    },
  },
};

export const heroConfig = {
  badge: "Live on Ethereum Sepolia",
  headline: {
    line1: "Agents don't get",
    line2: "keys. They get",
    accent: "permits.",
  },
  subheadline:
    "Every permit is decided by what the chain says will happen, and enforced atomically when it does. Prediction and enforcement are the same code path.",
  cta: {
    text: "Open the live dashboard",
    href: "/dashboard",
  },
};

export const blurHeadlineConfig = {
  text: "Two calls, same contract, same function, same argument type. Only the state they would produce differs. Every calldata-level guardrail passes both; the guard refuses the second because its consequence breaks the invariant.",
};

export const howItWorksConfig = {
  title: "How it works",
  description:
    "Three stages. The agent never holds a key; it holds a permit that is only valid while the chain agrees with the consequence.",
  cta: {
    text: "Open the live dashboard",
    href: "/dashboard",
  },
};

export const faqConfig = {
  title: "Everything you need to know",
  description: "Honest answers. If a feature does not exist, it says so.",
  cta: {
    primary: {
      text: "Open the live dashboard",
      href: "/dashboard",
    },
    secondary: {
      text: "Read the repo",
      href: "https://github.com/Venkat5599/KP",
    },
  },
};

export const footerConfig = {
  cta: {
    headline: "Run a guarded transaction in one command",
    placeholder: "",
    button: "Read the quickstart",
  },
  copyright: `© ${new Date().getFullYear()} noyeet. MIT licensed. Built for the KeeperHub hackathon.`,
};

/**
 * Feature flags.
 */
export const features = {
  smoothScroll: true,
  testimonialAutoplay: true,
  parallaxHero: true,
  blurInHeadline: true,
};

export const themeConfig = {
  defaultTheme: "system" as "light" | "dark" | "system",
  enableSystemTheme: true,
};
