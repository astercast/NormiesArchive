"use client";

import { motion } from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import { EditEvent } from "@/lib/eventIndexer";

interface TimelineScrubberProps {
  value: number;
  max: number;
  editHistory: EditEvent[];
  onChange: (value: number) => void;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "2-digit",
  });
}

export default function TimelineScrubber({ value, max, editHistory, onChange }: TimelineScrubberProps) {
  const currentEdit = editHistory[value - 1];
  const label = value === 0 ? "origin" : value === max ? "current" : `edit ${value}/${max - 1}`;

  return (
    <div className="space-y-3">
      {/* Labels */}
      <div className="flex items-center justify-between text-xs font-mono text-n-muted">
        <span>mint</span>
        <div className="flex items-center gap-2">
          {currentEdit && (
            <motion.span
              key={value}
              initial={{ opacity: 0, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-n-text"
            >
              {formatDate(currentEdit.timestamp)}
            </motion.span>
          )}
          <span className="text-n-faint">{label}</span>
        </div>
        <span>now</span>
      </div>

      {/* Slider */}
      <div className="relative">
        <Slider.Root
          className="relative flex items-center select-none touch-none w-full h-7"
          value={[value]}
          max={max}
          min={0}
          step={1}
          onValueChange={([v]) => onChange(v)}
          aria-label="Timeline scrubber"
        >
          <Slider.Track className="relative grow h-px bg-n-border rounded-full">
            {editHistory.map((edit, i) => {
              const pos = ((i + 1) / Math.max(max, 1)) * 100;
              return (
                <div
                  key={edit.txHash}
                  className="absolute top-1/2 -translate-y-1/2 w-0.5 h-2.5 bg-n-muted cursor-pointer hover:bg-n-text transition-colors"
                  style={{ left: `${pos}%` }}
                  title={`edit ${i + 1}: ${edit.changeCount} pixels`}
                  onClick={() => onChange(i + 1)}
                />
              );
            })}
            <Slider.Range className="absolute h-full bg-n-text rounded-full" />
          </Slider.Track>
          <Slider.Thumb
            className="block w-3 h-3 bg-n-text rounded-full cursor-grab active:cursor-grabbing focus:outline-none focus:ring-1 focus:ring-n-text/30 hover:scale-125 transition-transform"
          />
        </Slider.Root>
      </div>

      {/* Edit details */}
      {currentEdit && (
        <motion.div
          key={value}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-3 gap-1.5 text-center"
        >
          {[
            { val: currentEdit.changeCount, lbl: "px changed" },
            { val: currentEdit.newPixelCount, lbl: "total px" },
            { val: currentEdit.transformer.slice(0,6)+"…", lbl: "by" },
          ].map(({ val, lbl }) => (
            <div key={lbl} className="bg-n-surface border border-n-border rounded p-2">
              <div className="text-xs font-mono font-medium text-n-text">{val}</div>
              <div className="text-xs font-mono text-n-faint">{lbl}</div>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
