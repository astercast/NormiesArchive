import type { Metadata } from "next";
import { Suspense } from "react";
import AgenticLoungeClient from "./AgenticLoungeClient";

export const metadata: Metadata = {
  title: "Agentic Lounge",
  description:
    "Browse every ERC-8004 Normie agent — personas, skills, registered services, and OpenSea listings in one identity registry.",
};

export default function AgenticLoungePage() {
  return (
    <Suspense>
      <AgenticLoungeClient />
    </Suspense>
  );
}
