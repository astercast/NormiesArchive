import type { Metadata } from "next";
import { Suspense } from "react";
import AgenticLoungeClient from "./AgenticLoungeClient";

export const metadata: Metadata = {
  title: "Agentic Lounge — Normies Archive",
  description:
    "ERC-8004 registered agents with full-body sprites, live chats driven only by their published personas.",
};

export default function AgenticLoungePage() {
  return (
    <Suspense>
      <AgenticLoungeClient />
    </Suspense>
  );
}
