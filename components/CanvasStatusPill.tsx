"use client";

import { useEffect, useState } from "react";

interface CanvasStatus {
  paused: boolean;
}

export default function CanvasStatusPill() {
  const [status, setStatus] = useState<CanvasStatus | null>(null);

  useEffect(() => {
    fetch("https://api.normies.art/canvas/status")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStatus(d); })
      .catch(() => {});
  }, []);

  if (!status) return null;

  if (status.paused) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-px rounded border border-red-200 bg-red-50 text-red-600 text-[9px] font-mono">
        <span className="w-1 h-1 rounded-full bg-red-500 inline-block" />
        canvas paused
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-px rounded border border-emerald-200 bg-emerald-50 text-emerald-700 text-[9px] font-mono">
      <span className="w-1 h-1 rounded-full bg-emerald-500 inline-block animate-pulse" />
      canvas live
    </span>
  );
}
