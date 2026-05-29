"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentInfo } from "@/components/AgentSection";
import type { BondEdge } from "@/lib/agentic/types";
import { AGENTS_API } from "@/lib/agentic/constants";
import { stableHash } from "@/lib/agentic/utils";

interface Node {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  name: string;
  witnessCount: number;
}

interface Props {
  discoveredIds: Set<number>;
  infoMap: Map<number, AgentInfo>;
  bonds: BondEdge[];
  pinnedIds: number[];
  dark?: boolean;
  onSelect: (tokenId: number) => void;
  className?: string;
}

export default function ConstellationMap({
  discoveredIds,
  infoMap,
  bonds,
  pinnedIds,
  dark,
  onSelect,
  className = "",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<Map<number, Node>>(new Map());
  const rafRef = useRef(0);
  const dragRef = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const panRef = useRef({ x: 0, y: 0, dragging: false, sx: 0, sy: 0 });
  const [size, setSize] = useState({ w: 300, h: 300 });

  const witnessCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const b of bonds) {
      m.set(b.aId, (m.get(b.aId) ?? 0) + b.count);
      m.set(b.bId, (m.get(b.bId) ?? 0) + b.count);
    }
    return m;
  }, [bonds]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: Math.max(280, el.clientHeight) });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: Math.max(280, el.clientHeight) });
    return () => ro.disconnect();
  }, []);

  // Sync nodes when discovered set changes
  useEffect(() => {
    const nodes = nodesRef.current;
    const cx = size.w / 2;
    const cy = size.h / 2;
    for (const id of discoveredIds) {
      if (nodes.has(id)) continue;
      const angle = (stableHash(String(id)) % 360) * (Math.PI / 180);
      const r = 40 + (stableHash(`r${id}`) % 80);
      nodes.set(id, {
        id,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        vx: 0,
        vy: 0,
        name: infoMap.get(id)?.name ?? `#${id}`,
        witnessCount: witnessCounts.get(id) ?? 0,
      });
    }
    for (const id of [...nodes.keys()]) {
      if (!discoveredIds.has(id)) nodes.delete(id);
    }
  }, [discoveredIds, infoMap, witnessCounts, size.w, size.h]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = size;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const pan = panRef.current;
    ctx.save();
    ctx.translate(pan.x, pan.y);

    const isDark = dark;
    const nodes = nodesRef.current;
    const cx = w / 2;
    const cy = h / 2;

    // Central hive node (you)
    ctx.beginPath();
    ctx.arc(cx, cy, 8 + Math.min(discoveredIds.size * 0.15, 12), 0, Math.PI * 2);
    const hiveGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20);
    hiveGrad.addColorStop(0, isDark ? "rgba(6,182,212,0.9)" : "rgba(6,182,212,0.7)");
    hiveGrad.addColorStop(1, "rgba(6,182,212,0)");
    ctx.fillStyle = hiveGrad;
    ctx.fill();
    ctx.strokeStyle = isDark ? "rgba(6,182,212,0.6)" : "rgba(6,182,212,0.5)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Bond edges
    for (const bond of bonds) {
      const na = nodes.get(bond.aId);
      const nb = nodes.get(bond.bId);
      if (!na || !nb) continue;
      ctx.beginPath();
      ctx.moveTo(na.x, na.y);
      ctx.lineTo(nb.x, nb.y);
      ctx.strokeStyle = isDark
        ? `rgba(139,92,246,${Math.min(0.15 + bond.count * 0.08, 0.55)})`
        : `rgba(139,92,246,${Math.min(0.12 + bond.count * 0.06, 0.45)})`;
      ctx.lineWidth = Math.min(1 + bond.count * 0.5, 3);
      ctx.stroke();
    }

    // Spokes to center for pinned
    for (const id of pinnedIds) {
      const n = nodes.get(id);
      if (!n) continue;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(n.x, n.y);
      ctx.strokeStyle = isDark ? "rgba(6,182,212,0.2)" : "rgba(6,182,212,0.15)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Agent nodes
    for (const n of nodes.values()) {
      n.witnessCount = witnessCounts.get(n.id) ?? 0;
      const r = 5 + Math.min(n.witnessCount * 1.2, 10);
      const pinned = pinnedIds.includes(n.id);
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = pinned
        ? isDark ? "rgba(6,182,212,0.85)" : "rgba(6,182,212,0.75)"
        : isDark ? "rgba(212,213,211,0.75)" : "rgba(72,73,75,0.65)";
      ctx.fill();
      if (pinned) {
        ctx.strokeStyle = "rgba(6,182,212,0.9)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [size, bonds, pinnedIds, discoveredIds.size, dark, witnessCounts]);

  // Physics loop
  useEffect(() => {
    const { w, h } = size;
    const cx = w / 2;
    const cy = h / 2;

    const loop = () => {
      const nodes = nodesRef.current;
      for (const n of nodes.values()) {
        if (dragRef.current?.id === n.id) continue;
        // Pull toward center gently
        n.vx += (cx - n.x) * 0.00008;
        n.vy += (cy - n.y) * 0.00008;
        // Repel other nodes
        for (const m of nodes.values()) {
          if (m.id === n.id) continue;
          const dx = n.x - m.x;
          const dy = n.y - m.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < 36) {
            n.vx += (dx / dist) * 0.35;
            n.vy += (dy / dist) * 0.35;
          }
        }
        n.vx *= 0.88;
        n.vy *= 0.88;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(20, Math.min(w - 20, n.x));
        n.y = Math.max(20, Math.min(h - 20, n.y));
      }
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [size, draw]);

  const hitTest = (clientX: number, clientY: number): number | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = clientX - rect.left - panRef.current.x;
    const y = clientY - rect.top - panRef.current.y;
    let best: { id: number; d: number } | null = null;
    for (const n of nodesRef.current.values()) {
      const d = Math.hypot(n.x - x, n.y - y);
      const r = 5 + Math.min(n.witnessCount * 1.2, 10) + 8;
      if (d < r && (!best || d < best.d)) best = { id: n.id, d };
    }
    return best?.id ?? null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const id = hitTest(e.clientX, e.clientY);
    if (id != null) {
      const n = nodesRef.current.get(id)!;
      dragRef.current = { id, ox: e.clientX - n.x, oy: e.clientY - n.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } else {
      panRef.current = { ...panRef.current, dragging: true, sx: e.clientX - panRef.current.x, sy: e.clientY - panRef.current.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragRef.current) {
      const n = nodesRef.current.get(dragRef.current.id);
      if (n) {
        const rect = canvasRef.current!.getBoundingClientRect();
        n.x = e.clientX - rect.left - panRef.current.x;
        n.y = e.clientY - rect.top - panRef.current.y;
        n.vx = 0;
        n.vy = 0;
      }
    } else if (panRef.current.dragging) {
      panRef.current.x = e.clientX - panRef.current.sx;
      panRef.current.y = e.clientY - panRef.current.sy;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current && !panRef.current.dragging) {
      const id = dragRef.current.id;
      const moved = Math.hypot(e.movementX, e.movementY) < 6;
      dragRef.current = null;
      if (moved) onSelect(id);
    } else {
      panRef.current.dragging = false;
    }
  };

  const count = discoveredIds.size;

  return (
    <div
      ref={containerRef}
      className={`relative rounded-xl border border-n-border bg-[var(--white)] overflow-hidden ${className}`}
      style={{ minHeight: 280 }}
    >
      <div className="absolute top-2 left-3 z-10 text-[10px] font-mono text-n-faint uppercase tracking-wider pointer-events-none">
        constellation · {count} nodes · {bonds.length} bonds
      </div>
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none cursor-grab active:cursor-grabbing"
        style={{ height: size.h }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
      {/* Portrait strip for pinned / recent */}
      {count > 0 && (
        <div className="absolute bottom-0 inset-x-0 flex gap-1.5 p-2 overflow-x-auto scrollbar-none bg-gradient-to-t from-[var(--white)] via-[var(--white)]/95 to-transparent">
          {[...discoveredIds].slice(-12).map(id => (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={`shrink-0 w-9 h-9 rounded-md border overflow-hidden touch-manipulation ${
                pinnedIds.includes(id) ? "border-cyan-500 ring-1 ring-cyan-500/40" : "border-n-border"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${AGENTS_API}/agents/image/${id}`}
                alt=""
                className="w-full h-full object-contain pixelated"
                style={{ filter: dark ? "invert(1)" : "none" }}
              />
            </button>
          ))}
        </div>
      )}
      {count === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-xs font-mono text-n-faint text-center px-6 max-w-xs">
            Discover agents to grow your constellation. Every witnessed conversation draws a bond.
          </p>
        </div>
      )}
    </div>
  );
}
