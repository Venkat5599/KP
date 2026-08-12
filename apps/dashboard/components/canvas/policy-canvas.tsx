"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  BLOCKS,
  initialValues,
  specFor,
  type BlockKind,
  type BlockSpec,
} from "@/lib/canvas/blocks";
import { compile, type PlacedBlock } from "@/lib/canvas/compile";

/**
 * The policy canvas.
 *
 * Place rules and invariants, and the two artifacts they compile to appear beside them:
 * a policy document for the gateway and the invariant tuples that go into executeGuarded.
 * Everything here is live. Editing a field recompiles immediately, and what is rendered is
 * the real payload, not a mock of one.
 *
 * Two things are deliberate.
 *
 * Dragging is not the only way to place a block. Every palette entry is a real button, so
 * the canvas is usable from the keyboard and by anyone who cannot drag. A drag-only builder
 * is an unusable builder for a meaningful share of people, and it costs one onClick to
 * avoid.
 *
 * Policy blocks and invariant blocks are visually distinct because they are enforced by
 * different machinery at different moments. A policy rule refuses an intent before it
 * exists; an invariant reverts a transaction after the calls have already run. An operator
 * who cannot tell them apart will eventually believe a bound is enforced on chain when it
 * only ever lived in a config file.
 */

const GRID = 8;
const snap = (n: number): number => Math.round(n / GRID) * GRID;

export interface PolicyCanvasProps {
  /** "compact" is the landing-page surface; "full" is the dashboard workspace. */
  readonly variant?: "compact" | "full";
  readonly initialBlocks?: readonly PlacedBlock[];
}

/**
 * A block's rendered height, derived rather than assumed.
 *
 * Height is not uniform: it grows with the field count, so a fixed row pitch makes a
 * four-field block collide with whatever is seeded beneath it. 74px covers the header and
 * padding, and each field costs 52px, being its label, its input, and the row gap.
 */
function blockHeight(kind: BlockKind): number {
  return 74 + specFor(kind).fields.length * 52;
}

/**
 * The starting composition: one target, one function, one floor. A real, minimal policy,
 * and the smallest one the compiler will call deployable.
 *
 * Two columns, always. The invariant is the block that makes this system what it is, so it
 * has to be on screen without scrolling; stacking all three in one column pushes it below
 * the fold on the landing page, where the surface is shorter.
 */
export function defaultBlocks(): PlacedBlock[] {
  const seeds: BlockKind[] = ["target", "selector", "invariantFloor"];
  const columnGap = 288;
  const rowGap = 16;

  let y = 24;
  return seeds.map((kind, index) => {
    // The invariant opens the second column, so the policy rules and the on-chain
    // assertion read side by side rather than as one long list.
    const secondColumn = index === 2;
    const block: PlacedBlock = {
      id: `seed-${kind}`,
      kind,
      x: secondColumn ? 24 + columnGap : 24,
      y: secondColumn ? 24 : y,
      values: initialValues(kind),
    };
    if (!secondColumn) y += blockHeight(kind) + rowGap;
    return block;
  });
}

export function PolicyCanvas({
  variant = "full",
  initialBlocks,
}: PolicyCanvasProps) {
  const [blocks, setBlocks] = useState<PlacedBlock[]>(() => [
    ...(initialBlocks ?? defaultBlocks()),
  ]);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"policy" | "invariants">("policy");
  const surface = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const reduce = useReducedMotion();
  const domId = useId();

  const compiled = useMemo(() => compile(blocks), [blocks]);
  const used = useMemo(() => new Set(blocks.map((b) => b.kind)), [blocks]);

  const add = useCallback((kind: BlockKind, at?: { x: number; y: number }) => {
    seq.current += 1;
    const id = `b${seq.current}`;
    setBlocks((prev) => {
      // A click-placed block lands below whatever is already in the left column, measured
      // from real heights. Anything else stacks blocks on top of each other, which is
      // exactly the collision this canvas had on first paint.
      const column = prev.filter((b) => b.x < 24 + 288);
      const bottom = column.reduce(
        (low, b) => Math.max(low, b.y + blockHeight(b.kind)),
        8
      );

      return [
        ...prev,
        {
          id,
          kind,
          x: snap(at?.x ?? 24),
          y: snap(at?.y ?? bottom + 16),
          values: initialValues(kind),
        },
      ];
    });
    setSelected(id);
  }, []);

  const remove = useCallback((id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    setSelected((s) => (s === id ? null : s));
  }, []);

  const edit = useCallback((id: string, key: string, next: string) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id ? { ...b, values: { ...b.values, [key]: next } } : b
      )
    );
  }, []);

  const move = useCallback((id: string, dx: number, dy: number) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              x: Math.max(0, snap(b.x + dx)),
              y: Math.max(0, snap(b.y + dy)),
            }
          : b
      )
    );
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      // getData returns "" when the drag carried no payload, so the membership test is
      // the real guard here rather than a separate empty-string check.
      const kind = event.dataTransfer.getData("text/noyeet-block");
      if (!BLOCKS.some((b) => b.kind === kind)) return;
      const placed = kind as BlockKind;
      const rect = surface.current?.getBoundingClientRect();
      if (rect === undefined) return add(placed);
      add(placed, {
        x: event.clientX - rect.left - 130,
        y: event.clientY - rect.top - 30,
      });
    },
    [add]
  );

  const errors = compiled.issues.filter((i) => i.severity === "error");
  const warnings = compiled.issues.filter((i) => i.severity === "warning");
  const compact = variant === "compact";

  return (
    <div
      className={
        compact
          ? "border-border bg-border grid grid-cols-1 gap-px overflow-hidden rounded-2xl border lg:grid-cols-[minmax(0,1fr)_320px]"
          : "border-border bg-border grid grid-cols-1 gap-px overflow-hidden rounded-2xl border lg:grid-cols-[220px_minmax(0,1fr)_360px]"
      }
    >
      {!compact && <Palette used={used} onAdd={add} />}

      <div className="bg-frame relative">
        <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
          <p className="text-foreground text-sm font-medium">
            {blocks.length} {blocks.length === 1 ? "block" : "blocks"} placed
          </p>
          <Verdict
            deployable={compiled.deployable}
            errors={errors.length}
            warnings={warnings.length}
          />
        </div>

        <div
          ref={surface}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className={`canvas-surface relative overflow-auto ${compact ? "h-[340px]" : "h-[520px]"}`}
        >
          {blocks.length === 0 ? (
            <EmptyCanvas compact={compact} onAdd={add} />
          ) : (
            blocks.map((block) => (
              <CanvasBlock
                key={block.id}
                block={block}
                spec={specFor(block.kind)}
                selected={selected === block.id}
                invalid={errors.some((e) => e.blockId === block.id)}
                warned={warnings.some((w) => w.blockId === block.id)}
                reduce={reduce === true}
                domId={domId}
                onSelect={() => setSelected(block.id)}
                onMove={(dx, dy) => move(block.id, dx, dy)}
                onEdit={(key, next) => edit(block.id, key, next)}
                onRemove={() => remove(block.id)}
              />
            ))
          )}
        </div>

        {compact && <CompactPalette used={used} onAdd={add} />}
      </div>

      <Output
        view={view}
        onView={setView}
        compiled={compiled}
        issues={compiled.issues}
        compact={compact}
      />
    </div>
  );
}

/**
 * The verdict strip. It reuses the system's own three-state vocabulary rather than a
 * generic valid/invalid, because "this policy would refuse everything" is a real and
 * common mistake that a boolean cannot express.
 */
function Verdict({
  deployable,
  errors,
  warnings,
}: {
  deployable: boolean;
  errors: number;
  warnings: number;
}) {
  const label = !deployable
    ? `${errors} ${errors === 1 ? "problem" : "problems"}`
    : warnings > 0
      ? `${warnings} to review`
      : "Ready to deploy";

  const tone = !deployable
    ? "border-[color-mix(in_oklab,var(--deny)_45%,transparent)] text-[var(--deny)]"
    : warnings > 0
      ? "border-[color-mix(in_oklab,var(--hold)_45%,transparent)] text-[var(--hold)]"
      : "border-[color-mix(in_oklab,var(--allow)_45%,transparent)] text-[var(--allow)]";

  return (
    <p className={`rounded-full border px-3 py-1 font-mono text-xs ${tone}`}>
      {label}
    </p>
  );
}

/**
 * A placed block.
 *
 * Motion owns the drag transform so the position is never React state during the gesture;
 * the committed x and y are written once on drag end. The silhouette is a notch cut into
 * the left edge, which reads as a socket and marks which layer the block belongs to. That
 * shape is the one piece of bespoke geometry in the design, and it does real work: policy
 * blocks and invariant blocks are told apart by form, not only by colour, so the
 * distinction survives for anyone who cannot rely on hue.
 */
function CanvasBlock({
  block,
  spec,
  selected,
  invalid,
  warned,
  reduce,
  domId,
  onSelect,
  onMove,
  onEdit,
  onRemove,
}: {
  block: PlacedBlock;
  spec: BlockSpec;
  selected: boolean;
  invalid: boolean;
  warned: boolean;
  reduce: boolean;
  domId: string;
  onSelect: () => void;
  onMove: (dx: number, dy: number) => void;
  onEdit: (key: string, next: string) => void;
  onRemove: () => void;
}) {
  const isInvariant = spec.layer === "invariant";

  const edge = invalid
    ? "var(--deny)"
    : warned
      ? "var(--hold)"
      : isInvariant
        ? "var(--accent)"
        : "var(--rule)";

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0}
      onDragStart={onSelect}
      onDragEnd={(_, info) => onMove(info.offset.x, info.offset.y)}
      onPointerDown={onSelect}
      initial={false}
      animate={{ x: block.x, y: block.y }}
      transition={
        reduce
          ? { duration: 0 }
          : { type: "spring", stiffness: 520, damping: 42 }
      }
      style={{ borderColor: edge }}
      className={`canvas-block bg-frame absolute top-0 left-0 w-[264px] cursor-grab touch-none rounded-xl border active:cursor-grabbing ${
        selected ? "canvas-block-selected" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <p className="text-foreground truncate text-sm font-medium">
            {spec.title}
          </p>
          <p className="text-muted-foreground mt-0.5 font-mono text-[10px] tracking-wider uppercase">
            {isInvariant ? "asserted on chain" : "checked before broadcast"}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${spec.title}`}
          className="text-muted-foreground hover:bg-muted hover:text-foreground shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs transition-colors"
        >
          x
        </button>
      </div>

      <div className="grid gap-2 px-4 pb-4">
        {spec.fields.map((field) => {
          const inputId = `${domId}-${block.id}-${field.key}`;
          return (
            <div key={field.key} className="grid gap-1">
              <label
                htmlFor={inputId}
                className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase"
              >
                {field.label}
              </label>
              <input
                id={inputId}
                value={block.values[field.key] ?? ""}
                onChange={(e) => onEdit(field.key, e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                spellCheck={false}
                autoComplete="off"
                className="border-border bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/40 w-full rounded-md border px-2 py-1.5 font-mono text-xs outline-none focus-visible:ring-2"
              />
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

/** The palette. Each entry is both a drag source and a real button. */
function Palette({
  used,
  onAdd,
}: {
  used: Set<BlockKind>;
  onAdd: (k: BlockKind) => void;
}) {
  return (
    <div className="bg-frame">
      <p className="border-border text-foreground border-b px-4 py-3 text-sm font-medium">
        Blocks
      </p>
      <div className="grid gap-1 p-2">
        {BLOCKS.map((spec) => {
          const spent = spec.singleton && used.has(spec.kind);
          return (
            <button
              key={spec.kind}
              type="button"
              draggable={!spent}
              disabled={spent}
              onDragStart={(e) =>
                e.dataTransfer.setData("text/noyeet-block", spec.kind)
              }
              onClick={() => onAdd(spec.kind)}
              title={spec.summary}
              className="palette-item group hover:bg-muted grid w-full gap-0.5 rounded-lg px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <span className="text-foreground flex items-center gap-2 text-[13px] font-medium">
                <span
                  aria-hidden
                  className="h-3 w-[3px] rounded-full"
                  style={{
                    background:
                      spec.layer === "invariant"
                        ? "var(--accent)"
                        : "var(--rule)",
                  }}
                />
                {spec.title}
              </span>
              <span className="text-muted-foreground pl-[11px] text-xs leading-snug">
                {spent ? "Already placed" : spec.summary}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The landing-page palette: a horizontal strip under the canvas, same behaviour. */
function CompactPalette({
  used,
  onAdd,
}: {
  used: Set<BlockKind>;
  onAdd: (k: BlockKind) => void;
}) {
  return (
    <div className="border-border flex flex-wrap gap-1.5 border-t px-4 py-3">
      {BLOCKS.map((spec) => {
        const spent = spec.singleton && used.has(spec.kind);
        return (
          <button
            key={spec.kind}
            type="button"
            draggable={!spent}
            disabled={spent}
            onDragStart={(e) =>
              e.dataTransfer.setData("text/noyeet-block", spec.kind)
            }
            onClick={() => onAdd(spec.kind)}
            title={spec.summary}
            className="border-border text-foreground hover:border-ring hover:bg-muted inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span
              aria-hidden
              className="h-2.5 w-[3px] rounded-full"
              style={{
                background:
                  spec.layer === "invariant" ? "var(--accent)" : "var(--rule)",
              }}
            />
            {spec.title}
          </button>
        );
      })}
    </div>
  );
}

function EmptyCanvas({
  compact,
  onAdd,
}: {
  compact: boolean;
  onAdd: (k: BlockKind) => void;
}) {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div className="max-w-sm">
        <p className="text-foreground text-sm font-medium">
          Nothing placed yet
        </p>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
          Add an allowlisted target so the agent can call something, then an
          invariant so the guard can refuse a bad outcome. A policy without both
          is not enforceable.
        </p>
        {compact && (
          <button
            type="button"
            onClick={() => onAdd("target")}
            className="border-border text-foreground hover:border-ring hover:bg-muted mt-4 rounded-lg border px-3 py-1.5 text-sm transition-colors"
          >
            Add a target
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The compiled output.
 *
 * Two tabs because there are genuinely two artifacts, sent to two different places. The
 * policy JSON is what the gateway parses and hashes; the invariant tuples are the second
 * argument to executeGuarded. Showing them together in one blob would hide the fact that
 * one is enforced off chain before broadcast and the other on chain at inclusion.
 */
function Output({
  view,
  onView,
  compiled,
  issues,
  compact,
}: {
  view: "policy" | "invariants";
  onView: (v: "policy" | "invariants") => void;
  compiled: ReturnType<typeof compile>;
  issues: ReturnType<typeof compile>["issues"];
  compact: boolean;
}) {
  const text =
    view === "policy"
      ? JSON.stringify(compiled.policy, null, 2)
      : JSON.stringify(
          compiled.invariants.map((i) => [
            i.target,
            i.probe,
            i.word,
            i.op,
            i.threshold,
          ]),
          null,
          2
        );

  return (
    <div className="bg-frame flex min-w-0 flex-col">
      <div className="border-border flex items-center gap-1 border-b p-2">
        {(["policy", "invariants"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onView(tab)}
            aria-pressed={view === tab}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              view === tab
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {tab === "policy"
              ? "Policy document"
              : `Invariants (${compiled.invariants.length})`}
          </button>
        ))}
      </div>

      <p className="border-border text-muted-foreground border-b px-4 py-2 text-xs leading-relaxed">
        {view === "policy"
          ? "Parsed and hashed by the gateway. The hash is committed on chain before the run."
          : "Passed to executeGuarded and asserted after the calls, so a broken bound reverts."}
      </p>

      <pre
        className={`text-foreground min-w-0 flex-1 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed ${
          compact ? "max-h-[240px]" : "max-h-[380px]"
        }`}
      >
        <code>{text}</code>
      </pre>

      {issues.length > 0 && (
        <ul className="border-border grid gap-1.5 border-t px-4 py-3">
          {issues.slice(0, 4).map((issue, index) => (
            <li
              key={`${issue.blockId ?? "policy"}-${index}`}
              className="flex gap-2 text-xs leading-snug"
            >
              <span
                aria-hidden
                className="mt-1 h-2.5 w-[3px] shrink-0 rounded-full"
                style={{
                  background:
                    issue.severity === "error" ? "var(--deny)" : "var(--hold)",
                }}
              />
              <span className="text-muted-foreground">{issue.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
