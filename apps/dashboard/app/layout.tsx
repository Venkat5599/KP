import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "noyeet — simulation-gated execution for onchain agents",
  description:
    "Agents do not get keys. They get permits, decided by what the chain says will happen and enforced atomically when it does.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
