import { Badge } from "@/components/ui/badge";
import { getStatusPresentation } from "@/lib/status-presentation";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const presentation = getStatusPresentation(status);

  return (
    <Badge className={cn("border", presentation.badgeClassName, className)} variant="neutral">
      {presentation.label}
    </Badge>
  );
}
