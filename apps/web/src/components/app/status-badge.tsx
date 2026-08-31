import type { BadgeProps } from "@/components/ui/badge";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: string }) {
  const variantByStatus: Record<string, BadgeProps["variant"]> = {
    draft: "neutral",
    published: "green",
    archived: "amber",
    queued: "blue",
    running: "amber",
    succeeded: "green",
    failed: "red",
    cancelled: "neutral"
  };

  return <Badge variant={variantByStatus[status] ?? "neutral"}>{status}</Badge>;
}
