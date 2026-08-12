"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useMemo, useState, type DragEvent, type ReactNode } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
  type OnConnect,
} from "@xyflow/react";
import { Copy, Trash2 } from "lucide-react";
import { BLOCKS, specFor } from "@/lib/canvas/blocks";
import { compile, type PlacedBlock } from "@/lib/canvas/compile";

/**
 * The policy canvas, n8n-style: a palette of real policy blocks, drag them onto the
 * canvas, wire them, configure each node. The artifact panel compiles the placement
 * with the same pure compiler the gateway's policy VM consumes — nothing here is a
 * picture of a policy, it is the policy document plus the invariant tuples.
 */

interface BlockNodeData extends Record<string, unknown> {
  readonly block: PlacedBlock;
}

type BlockNode = Node<BlockNodeData, "block">;

const LAYER_STYLES = {
  policy: { border: "border-neutral-400/60", badge: "bg-neutral-200 text-neutral-700" },
  invariant: { border: "border-emerald-500/50", badge: "bg-emerald-500/10 text-emerald-600" },
} as const;

function BlockNodeComponent({ data, selected }: NodeProps<BlockNode>): ReactNode {
  const spec = specFor(data.block.kind);
  const layer = LAYER_STYLES[spec.layer];
  return (
    <div
      className={`w-64 rounded-xl border-2 bg-background shadow-sm ${
        selected ? "border-accent" : layer.border
      }`}
    >
      {/* n8n-style header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <p className="truncate font-mono text-xs font-semibold">{spec.title}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] ${layer.badge}`}>
          {spec.layer}
        </span>
      </div>
      <div className="space-y-1 px-3 py-2">
        {spec.fields.map((field) => (
          <p key={field.key} className="truncate font-mono text-[11px] text-muted-foreground">
            <span className="text-foreground/70">{field.label}:</span>{" "}
            {(data.block.values[field.key] ?? "").trim() || "—"}
          </p>
        ))}
      </div>
      <div
        className="h-1 w-full rounded-b-xl"
        style={{ backgroundColor: spec.layer === "invariant" ? "rgb(16 185 129)" : "rgb(163 163 163)" }}
        aria-hidden="true"
      />
    </div>
  );
}

const nodeTypes: NodeTypes = { block: BlockNodeComponent };

export interface PolicyCanvasProps {
  readonly initialBlocks: readonly PlacedBlock[];
  readonly deployedPolicyJson: string | null;
  readonly initialName: string;
  readonly carryOver?: Record<string, unknown>;
}

export function PolicyCanvas({
  initialBlocks,
  deployedPolicyJson,
  initialName,
  carryOver,
}: PolicyCanvasProps): ReactNode {
  const [name, setName] = useState(initialName);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState<"policy" | "invariants" | null>(null);

  const initialNodes = useMemo<BlockNode[]>(
    () =>
      initialBlocks.map((block) => ({
        id: block.id,
        type: "block" as const,
        position: { x: block.x, y: block.y },
        data: { block },
      })),
    [initialBlocks],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<BlockNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const blocks = useMemo<PlacedBlock[]>(
    () => nodes.map((node) => node.data.block),
    [nodes],
  );

  const compiled = useMemo(
    () => compile(blocks, { ...(carryOver !== undefined ? { carryOver } : {}), name }),
    [blocks, carryOver, name],
  );

  const deployedNormalized = useMemo(() => {
    if (deployedPolicyJson === null) return null;
    try {
      return JSON.stringify(JSON.parse(deployedPolicyJson) as unknown);
    } catch {
      return null;
    }
  }, [deployedPolicyJson]);
  const compiledNormalized = JSON.stringify(compiled.policy);
  const diverged = deployedNormalized !== null && compiledNormalized !== deployedNormalized;

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, animated: true }, eds));
    },
    [setEdges],
  );

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData("application/noyeet-block");
      if (kind === "") return;
      const spec = specFor(kind as PlacedBlock["kind"]);
      const position = (event.target as HTMLElement).closest(".react-flow")?.getBoundingClientRect();
      const x = position ? event.clientX - position.left : 120;
      const y = position ? event.clientY - position.top : 60;
      const values: Record<string, string> = {};
      for (const field of spec.fields) values[field.key] = field.initial;
      const id = `${kind}-${Date.now().toString(36)}`;
      setNodes((nds) => [
        ...nds,
        {
          id,
          type: "block",
          position: { x: Math.max(0, x - 128), y: Math.max(0, y - 20) },
          data: { block: { id, kind: kind as PlacedBlock["kind"], x, y, values } },
        },
      ]);
      setSelectedId(id);
    },
    [setNodes],
  );

  const updateValue = (nodeId: string, key: string, value: string) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? { ...node, data: { block: { ...node.data.block, values: { ...node.data.block.values, [key]: value } } } }
          : node,
      ),
    );
  };

  const removeNode = (nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedId(null);
  };

  const selectedNode = nodes.find((node) => node.id === selectedId) ?? null;
  const selectedSpec = selectedNode ? specFor(selectedNode.data.block.kind) : null;

  const copy = async (text: string, which: "policy" | "invariants") => {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-background/60 px-4 py-3">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="Policy name"
          className="w-56 rounded-lg border border-border/70 bg-background px-3 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-accent"
        />
        <span
          className={`rounded-full px-3 py-1 font-mono text-[11px] ${
            diverged
              ? "bg-amber-500/10 text-amber-600"
              : "bg-emerald-500/10 text-emerald-600"
          }`}
        >
          {deployedNormalized === null
            ? "no deployed policy on this deployment"
            : diverged
              ? "diverged from the deployed policy"
              : "matches the deployed policy"}
        </span>
        <span
          className={`ml-auto rounded-full px-3 py-1 font-mono text-[11px] ${
            compiled.deployable ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"
          }`}
        >
          {compiled.deployable ? "deployable" : `${compiled.issues.length} issue(s)`}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr_280px]">
        {/* Palette */}
        <aside className="rounded-2xl border border-border/70 bg-background/60 p-3">
          <p className="mb-2 px-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Blocks
          </p>
          <div className="space-y-2">
            {BLOCKS.map((spec) => (
              <div
                key={spec.kind}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/noyeet-block", spec.kind);
                  event.dataTransfer.effectAllowed = "move";
                }}
                className="cursor-grab rounded-xl border border-border/70 bg-background px-3 py-2 transition-colors hover:border-accent active:cursor-grabbing"
              >
                <p className="font-mono text-xs font-medium">{spec.title}</p>
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{spec.summary}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 px-1 font-mono text-[10px] text-muted-foreground">
            Drag onto the canvas. {BLOCKS.filter((b) => b.singleton).length} are singletons.
          </p>
        </aside>

        {/* Canvas */}
        <div
          className="react-flow h-[560px] overflow-hidden rounded-2xl border border-border/70"
          onDrop={onDrop}
          onDragOver={(event) => event.preventDefault()}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
            deleteKeyCode={["Backspace", "Delete"]}
            onNodesDelete={(deleted) => {
              setSelectedId(null);
              void deleted;
            }}
            proOptions={{ hideAttribution: false }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>

        {/* Inspector */}
        <aside className="rounded-2xl border border-border/70 bg-background/60 p-4">
          {selectedNode !== null && selectedSpec !== null ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-xs font-semibold">{selectedSpec.title}</p>
                <button
                  type="button"
                  onClick={() => removeNode(selectedNode.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2 py-1 font-mono text-[10px] text-red-500 transition-colors hover:bg-red-500/10"
                >
                  <Trash2 className="size-3" aria-hidden="true" />
                  Remove
                </button>
              </div>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">{selectedSpec.summary}</p>
              <div className="mt-4 space-y-3">
                {selectedSpec.fields.map((field) => (
                  <div key={field.key}>
                    <label htmlFor={`${selectedNode.id}-${field.key}`} className="font-mono text-[11px] text-muted-foreground">
                      {field.label}
                    </label>
                    <input
                      id={`${selectedNode.id}-${field.key}`}
                      value={selectedNode.data.block.values[field.key] ?? ""}
                      onChange={(event) => updateValue(selectedNode.id, field.key, event.target.value)}
                      spellCheck={false}
                      className="mt-1 w-full rounded-lg border border-border/70 bg-background px-3 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="font-mono text-[11px] text-muted-foreground">
              Select a node to configure it. The artifact panel below compiles the whole
              placement live.
            </p>
          )}
        </aside>
      </div>

      {/* Artifact panel */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-background/60">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Policy document
            </p>
            <button
              type="button"
              onClick={() => copy(JSON.stringify(compiled.policy, null, 2), "policy")}
              className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Copy className="size-3" aria-hidden="true" />
              {copied === "policy" ? "copied" : "copy"}
            </button>
          </div>
          <pre className="max-h-72 overflow-auto p-4 font-mono text-[11px] leading-relaxed">
            {JSON.stringify(compiled.policy, null, 2)}
          </pre>
        </div>

        <div className="rounded-2xl border border-border/70 bg-background/60">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Invariant tuples (executeGuarded)
            </p>
            <button
              type="button"
              onClick={() => copy(JSON.stringify(compiled.invariants, null, 2), "invariants")}
              className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Copy className="size-3" aria-hidden="true" />
              {copied === "invariants" ? "copied" : "copy"}
            </button>
          </div>
          {compiled.invariants.length === 0 ? (
            <p className="p-4 font-mono text-[11px] text-muted-foreground">
              No invariant blocks placed. Without one, the guard has nothing to assert and
              the policy is not deployable.
            </p>
          ) : (
            <pre className="max-h-72 overflow-auto p-4 font-mono text-[11px] leading-relaxed">
              {JSON.stringify(compiled.invariants, null, 2)}
            </pre>
          )}
        </div>
      </div>

      {compiled.issues.length > 0 ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-red-500">
            Issues
          </p>
          <ul className="mt-2 space-y-1">
            {compiled.issues.map((issue, index) => (
              <li key={`${issue.blockId}-${index}`} className="font-mono text-[11px] text-red-500">
                {issue.severity === "error" ? "✗" : "!"} {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
