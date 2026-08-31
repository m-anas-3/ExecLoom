export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-neutral-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-neutral-950">{value}</p>
    </div>
  );
}
