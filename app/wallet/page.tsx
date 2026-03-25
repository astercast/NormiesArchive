import type { Metadata } from "next";
import WalletSearchClient from "./WalletSearchClient";

export const metadata: Metadata = {
  title: "Wallet Search — Normies Archive",
  description: "Look up any wallet or ENS name to see all owned Normies, sorted by action points.",
};

export default function WalletPage() {
  return <WalletSearchClient />;
}
