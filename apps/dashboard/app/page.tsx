import { BlurInHeadline } from "@/components/blur-in-headline";
import { FAQ } from "@/components/faq";
import { FeaturesBento } from "@/components/features-bento";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { Pricing } from "@/components/pricing";
import { Testimonials } from "@/components/testimonials";
import { ThemeSwitch } from "@/components/theme-switch";
import { createMetadata, siteConfig } from "@/lib/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: siteConfig.name,
  description: siteConfig.description,
  path: "/",
});

export default function HomePage(): ReactNode {
  return (
    <main id="main-content" className="flex-1">
      {/* Fixed frame */}
      <div className="site-frame site-frame--top" aria-hidden="true" />
      <div className="site-frame site-frame--bottom" aria-hidden="true" />
      <div className="site-frame site-frame--left" aria-hidden="true" />
      <div className="site-frame site-frame--right" aria-hidden="true" />

      {/* Corner decorations */}
      <svg className="site-corner site-corner--top-left" width="50" height="50" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M5.50871e-06 0C-0.00788227 37.3001 8.99616 50.0116 50 50H5.50871e-06V0Z" fill="currentColor" />
      </svg>
      <svg className="site-corner site-corner--top-right" width="50" height="50" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M5.50871e-06 0C-0.00788227 37.3001 8.99616 50.0116 50 50H5.50871e-06V0Z" fill="currentColor" />
      </svg>
      <svg className="site-corner site-corner--bottom-left" width="50" height="50" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M5.50871e-06 0C-0.00788227 37.3001 8.99616 50.0116 50 50H5.50871e-06V0Z" fill="currentColor" />
      </svg>
      <svg className="site-corner site-corner--bottom-right" width="50" height="50" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M5.50871e-06 0C-0.00788227 37.3001 8.99616 50.0116 50 50H5.50871e-06V0Z" fill="currentColor" />
      </svg>

      <Header />
      <ThemeSwitch />

      <Hero />
      <Testimonials />
      <FeaturesBento />
      <HowItWorks />
      <BlurInHeadline />
      <Pricing />
      <FAQ />
      <Footer />
    </main>
  );
}
