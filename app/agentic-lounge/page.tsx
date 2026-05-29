import type { Metadata } from "next";
import { Suspense } from "react";
import AgenticLoungeClient from "./AgenticLoungeClient";

export const metadata: Metadata = {
  title: "The Hive — Agentic Lounge",
  description:
    "The world's first ERC-8004 persona resonance lounge. Swipe to discover agents, witness live theatre dialogues, and grow your constellation of bonds.",
};

export default function AgenticLoungePage() {
  return (
    <Suspense>
      <AgenticLoungeClient />
    </Suspense>
  );
}
