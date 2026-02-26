"use client";

export default function GlobalStats() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[
        { label: "TOTAL NORMIES", value: "10,000" },
        { label: "TOTAL EDITS", value: "—" },
        { label: "PIXELS CHANGED", value: "—" },
        { label: "CUSTOMIZED", value: "—" },
      ].map(({ label, value }) => (
        <div key={label} className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-lg p-4 text-center">
          <div className="text-2xl font-bold font-mono text-[#00ff88]">{value}</div>
          <div className="text-xs font-mono text-[#555555] mt-1">{label}</div>
        </div>
      ))}
    </div>
  );
}
