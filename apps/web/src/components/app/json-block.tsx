import { formatJson } from "@/lib/json-authoring";

export function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium">{label}</h3>
      <pre className="max-h-56 overflow-auto rounded-md bg-neutral-950 p-4 text-xs text-neutral-100">
        {formatJson(value)}
      </pre>
    </div>
  );
}
