import type { Metadata } from "next";
import { isAddress } from "viem";
import AddressClient from "./AddressClient";

interface Props { params: Promise<{ addr: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { addr } = await params;
  const short = isAddress(addr) ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
  return {
    title:       `${short} — Normies Archive`,
    description: `All Normies NFTs owned by ${short}, sorted by action points.`,
  };
}

export default async function AddressPage({ params }: Props) {
  const { addr } = await params;
  return <AddressClient addr={addr} />;
}
