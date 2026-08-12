import { FAQ } from "@/components/faq";
import { FeaturesBento } from "@/components/features-bento";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { LiveProbe } from "@/components/live-probe";
import { createMetadata, siteConfig } from "@/lib/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: siteConfig.name,
  description: siteConfig.description,
  path: "/",
});

/**
 * The landing page.
 *
 * The removed sections were removed because they were not true. Pricing listed three tiers
 * at zero for an MIT library, with the middle one marked popular. Testimonials carried
 * quotes attributed to "The guard" and "The suite" at companies that are not customers.
 * Inventing social proof for a security product is a strange thing to do, and the live
 * probe below is stronger evidence than any of it: it runs two real simulations against the
 * deployed guard on every request and shows what the chain said.
 */
export default function HomePage(): ReactNode {
  return (
    <main id="main-content" className="flex-1">
      <Hero />
      <LiveProbe />
      <FeaturesBento />
      <HowItWorks />
      <FAQ />
      <Footer />
    </main>
  );
}
