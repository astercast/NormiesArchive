import type { Metadata } from "next";
import { isAddress } from "viem";
import AddressesClient from "./AddressesClient";

interface Props { searchParams: Promise<{ q?: string }> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  const count = (q ?? "").split(",").map(s => s.trim()).filter(s => isAddress(s)).length;
  return {
    title:       `${count} wallet${count !== 1 ? "s" : ""} — Normies Archive`,
    description: `Combined Normies view across ${count} wallet${count !== 1 ? "s" : ""}.`,
  };
}

export default async function AddressesPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const addrs = (q ?? "").split(",").map(s => s.trim()).filter(Boolean);
  return <AddressesClient addrs={addrs} />;
}
