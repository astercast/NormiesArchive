"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Lock, Shield } from "lucide-react";
import { PASSCODE } from "@/lib/agentic/constants";

interface Props {
  onUnlock: () => void;
}

export default function LoungeLock({ onUnlock }: Props) {
  const [digits, setDigits] = useState<string[]>([]);
  const [shake, setShake] = useState(false);
  const [success, setSuccess] = useState(false);
  const hiddenRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    hiddenRef.current?.focus();
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const push = useCallback(
    (d: string) => {
      if (shake || success) return;
      setDigits(prev => {
        if (prev.length >= 4) return prev;
        const next = [...prev, d];
        if (next.length === 4) {
          if (next.join("") === PASSCODE) {
            setSuccess(true);
            setTimeout(onUnlock, 450);
          } else {
            setShake(true);
            setTimeout(() => {
              setShake(false);
              setDigits([]);
            }, 550);
          }
        }
        return next;
      });
    },
    [shake, success, onUnlock]
  );

  const pop = useCallback(() => {
    if (!shake && !success) setDigits(p => p.slice(0, -1));
  }, [shake, success]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg)] px-4 select-none"
      onClick={() => hiddenRef.current?.focus()}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        aria-hidden
        style={{
          background: `
            radial-gradient(700px 400px at 50% 20%, rgba(6,182,212,0.15), transparent 60%),
            radial-gradient(500px 300px at 80% 80%, rgba(139,92,246,0.08), transparent 50%)`,
        }}
      />

      <input
        ref={hiddenRef}
        className="sr-only"
        readOnly
        value=""
        aria-label="Passcode entry"
        onKeyDown={e => {
          if (/^\d$/.test(e.key)) push(e.key);
          else if (e.key === "Backspace") pop();
        }}
      />

      <motion.div
        className="relative w-full max-w-sm space-y-8"
        animate={success ? { scale: [1, 1.04, 1] } : shake ? { x: [-14, 14, -10, 10, 0] } : {}}
        transition={{ duration: 0.35 }}
      >
        <div className="text-center space-y-4">
          <div className="mx-auto w-20 h-20 rounded-2xl border-2 border-cyan-500/30 bg-cyan-500/10 flex items-center justify-center shadow-[0_0_40px_rgba(6,182,212,0.12)]">
            <Lock className={`w-9 h-9 ${success ? "text-cyan-500" : "text-n-muted"}`} />
          </div>
          <div>
            <h1 className="font-mono text-2xl font-medium text-n-text tracking-tight">agentic lounge</h1>
            <p className="text-sm font-mono text-n-faint mt-2 leading-relaxed max-w-xs mx-auto">
              ERC-8004 agent identities — passcode required for early access
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-n-faint border border-n-border rounded-full px-3 py-1">
            <Shield className="w-3 h-3" />
            locked
          </div>
        </div>

        <div className="flex justify-center gap-3">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className={`w-14 h-16 rounded-xl border-2 flex items-center justify-center text-lg font-mono transition-all ${
                success
                  ? "border-cyan-400 bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"
                  : shake
                    ? "border-red-400/80 bg-red-500/10"
                    : i < digits.length
                      ? "border-n-text bg-n-surface"
                      : i === digits.length
                        ? "border-cyan-500/50 bg-n-surface"
                        : "border-n-border"
              }`}
            >
              {i < digits.length ? "●" : i === digits.length && !shake ? (
                <span className="animate-pulse text-cyan-500">_</span>
              ) : (
                ""
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "←", "0", ""].map((k, i) => (
            <button
              key={i}
              type="button"
              onClick={() => (k === "←" ? pop() : k ? push(k) : undefined)}
              disabled={!k || shake}
              className={`min-h-[54px] font-mono text-lg rounded-xl border touch-manipulation transition-colors ${
                k
                  ? "border-n-border text-n-muted active:bg-n-surface hover:border-n-text hover:text-n-text"
                  : "invisible pointer-events-none"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
