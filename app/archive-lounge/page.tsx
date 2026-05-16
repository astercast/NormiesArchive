import type { Metadata } from "next";
import { Suspense } from "react";
import ArchiveLoungeClient from "./ArchiveLoungeClient";

export const metadata: Metadata = {
  title: "Archive Lounge — Normies Archive",
  description: "Agentic normies hanging out in the archive lounge. ERC-8004 registered agents with full-body sprites.",
};

export default function ArchiveLoungePage() {
  return (
    <Suspense>
      <ArchiveLoungeClient />
    </Suspense>
  );
}
