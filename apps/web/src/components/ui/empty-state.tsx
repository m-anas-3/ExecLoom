import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid place-items-center px-6 py-14 text-center", className)}>
      <div className="grid size-10 place-items-center rounded-md border border-neutral-200 bg-white text-neutral-500 shadow-sm">
        <Icon className="size-4" />
      </div>
      <p className="mt-4 text-sm font-semibold text-neutral-950">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-5 text-neutral-600">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
