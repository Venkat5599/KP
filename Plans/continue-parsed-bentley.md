# Finish the noyeet frontend: fix what the browser exposed

## Context

You asked for a drag-and-drop policy canvas like KeeperHub's, a fixed landing page, a
dashboard route inside it, zero emojis, and zero mockup files. Most of that is already
built and merged. What remains is a set of **real UI bugs I saw in the browser**, plus the
point-by-point anti-slop re-check I promised before calling anything done.

### Already done this session (merged and pushed as `4396a02`)

- `lib/canvas/blocks.ts` + `lib/canvas/compile.ts`: a pure block catalogue and compiler.
  Verified it emits the exact 74-char probe calldata the live `lib/probe.ts` uses.
- `components/canvas/policy-canvas.tsx`: the drag-and-drop canvas, Motion-driven so the
  drag never round-trips through React state. Every palette entry is also a real button, so
  the canvas is keyboard-usable. Compiles a policy document and invariant tuples live.
- Hero rebuilt around the canvas rather than a screenshot of one.
- Deleted `testimonials.tsx` (quotes attributed to "The guard" and "The suite"),
  `pricing.tsx` (three $0 tiers with a "popular" middle card), `blur-in-headline.tsx`
  (content gated behind a scroll reveal), `logo-loop.tsx` (text wordmarks as a logo wall),
  `theme-toggle.tsx` (orphan).
- Replaced the sun-moon pill with a labelled Light/Dark/Auto control.
- Zero emojis confirmed repo-wide; em-dashes and arrows normalised.
- Corrected a stale "156 tests" claim to the real 164.

### What the browser actually showed, which is the reason for this plan

Screenshots of `/` and `/dashboard` at 1536x720 exposed five defects no test caught:

1. **The theme switch is sliced by the viewport's left edge.** It renders as
   "ght Dark Auto": the word "Light" is cut off. Text jammed against, and clipped by, an
   edge.
2. **A marketing header floats over the dashboard**, carrying "Products" and "Resources"
   dropdowns. noyeet has neither. `header.tsx:163` and `:245` also point at `href="#"`.
3. **Duplicate CTA intent.** The header says "Open dashboard"; the hero says "Open the
   dashboard". Same intent, two labels, one screen.
4. **Seeded canvas blocks overlap.** "Permitted function" is seeded at `y: 148`, but
   "Allowlisted target" above it is taller than that, so they collide on first paint.
5. **The third block is hidden** behind the output column in the compact variant.

## Approach

### A. Fix the five browser-visible defects

**`app/layout.tsx`** - the theme switch sits where it gets clipped. Move it into the
header's right cluster so it lands inside the page's normal gutter. Nothing should touch
the viewport rim.

**`components/header.tsx`** - rewrite the nav. Drop the `Products` and `Resources`
dropdowns and both `href="#"` links; they are template leftovers describing a product that
does not exist. Keep three real destinations: Dashboard, GitHub, and the theme control.
Remove the decorative lime square button beside the CTA. Resolve the duplicate CTA by
keeping the single primary action in the hero and letting the header's "Dashboard" be a
plain nav link rather than a second filled button.

**`app/dashboard/page.tsx` and `app/layout.tsx`** - the marketing header does not belong on
the app route. Give `/dashboard` a minimal header (wordmark, theme control) instead.

**`components/canvas/policy-canvas.tsx`** - `defaultBlocks()` seeds `y` positions that
assume uniform block height, but height scales with field count (target 1, selector 2,
floor 4). Derive the seed offsets from field count instead of a fixed 124px, and seed the
compact variant into a single column so nothing lands under the output panel.

### B. Anti-slop pass on the sections not yet rewritten

**Theme-lock violations, which are functional bugs rather than taste.**
`features-bento.tsx` hardcodes `bg-white`, `text-black`, `text-white`; `footer.tsx`
hardcodes `text-neutral-900/50`. These do not respond to the token swap, so text goes
invisible in one mode. Replace every hardcoded neutral with the tokens already defined in
`app/globals.css` (`--foreground`, `--muted-foreground`, `--card-foreground`, `--frame`).

**Generic iconography.** `how-it-works.tsx` uses `Rocket`, `Users`, `CalendarCheck`;
`features-bento.tsx` uses `Star`, `CircleCheck`. `Rocket` on a security product is the
startup-slop signature. lucide stays, since the project already depends on it and the
design law permits that, but these specific glyphs go: the steps are carried by the step
content, and the metric cards need no decorative star.

**Eyebrow count.** Six sections (Hero, LiveProbe, FeaturesBento, HowItWorks, FAQ, Footer)
permit at most two eyebrows. `live-probe.tsx:78` has one. Audit `features-bento.tsx` and
`how-it-works.tsx` and cut anything beyond the budget. Footer column headings and form
field labels are not eyebrows and stay.

**Tag pills.** `features-bento.tsx:65` and `:200` wrap metadata in rounded-full chips. Keep
one only where it carries real state; otherwise use type weight.

### C. Cleanup

Confirm no mockup files remain outside test directories. `packages/guard/test/Mocks.sol`
and `packages/policy/test/fixtures.ts` are test doubles used by the suite and stay; they
are not shipped mock data. Check whether `smooth-scroll.tsx` (lenis) earns its bundle cost.

### D. Verification

- `bunx tsc --noEmit` in `apps/dashboard`, then `bun run build`.
- `bun test packages apps templates` stays at 164 pass, 0 fail.
- Serve the production build and screenshot `/` and `/dashboard` in Chrome at desktop
  **and** mobile width, in **both** light and dark mode. The theme lock and the clipping
  fix cannot be verified any other way.
- Drive the canvas with a real pointer: drag a block, edit a field, confirm the JSON
  recompiles, delete a block, confirm the verdict strip changes state.
- Tab through the palette to confirm the non-drag path works.
- Read the console for errors on both routes.
- Then walk the anti-slop law point by point against the shipped pages and fix what falls
  short, as promised.
- Commit and push to `Venkat5599/KP`.

## Files

| File | Change |
| --- | --- |
| `components/header.tsx` | Remove fake nav, dead links, duplicate CTA, decorative button |
| `app/layout.tsx` | Move the theme control out of the clipped position; split app and marketing chrome |
| `components/canvas/policy-canvas.tsx` | Height-aware seed positions; compact single-column seeding |
| `components/features-bento.tsx` | Token colours, drop Star and CircleCheck, reduce pills |
| `components/how-it-works.tsx` | Token colours, drop Rocket, Users, CalendarCheck |
| `components/footer.tsx` | Token colours |
| `app/dashboard/page.tsx` | Minimal app header instead of the marketing nav |
