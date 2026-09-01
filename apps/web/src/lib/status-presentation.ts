import type {
  ExecutionStatus,
  StepRunResponse,
  WorkflowResponse,
  WorkflowVersionResponse
} from "@execloom/contracts";
import {
  Archive,
  Check,
  Circle,
  Clock3,
  LoaderCircle,
  Minus,
  RotateCw,
  X
} from "lucide-react";

export type ProductStatus =
  | WorkflowResponse["status"]
  | WorkflowVersionResponse["status"]
  | ExecutionStatus
  | StepRunResponse["status"];

export const statusPresentation: Record<
  ProductStatus,
  {
    label: string;
    badgeClassName: string;
    iconClassName: string;
    icon: typeof Circle;
  }
> = {
  draft: {
    label: "Draft",
    badgeClassName: "border-neutral-200 bg-neutral-100 text-neutral-700",
    iconClassName: "text-neutral-500",
    icon: Circle
  },
  published: {
    label: "Published",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    iconClassName: "text-emerald-600",
    icon: Check
  },
  archived: {
    label: "Archived",
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
    iconClassName: "text-amber-600",
    icon: Archive
  },
  retired: {
    label: "Retired",
    badgeClassName: "border-neutral-200 bg-neutral-100 text-neutral-600",
    iconClassName: "text-neutral-500",
    icon: Archive
  },
  pending: {
    label: "Pending",
    badgeClassName: "border-neutral-200 bg-neutral-100 text-neutral-600",
    iconClassName: "text-neutral-500",
    icon: Circle
  },
  queued: {
    label: "Queued",
    badgeClassName: "border-sky-200 bg-sky-50 text-sky-700",
    iconClassName: "text-sky-600",
    icon: Clock3
  },
  running: {
    label: "Running",
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
    iconClassName: "text-amber-600",
    icon: LoaderCircle
  },
  retrying: {
    label: "Retrying",
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
    iconClassName: "text-amber-600",
    icon: RotateCw
  },
  succeeded: {
    label: "Succeeded",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    iconClassName: "text-emerald-600",
    icon: Check
  },
  failed: {
    label: "Failed",
    badgeClassName: "border-red-200 bg-red-50 text-red-700",
    iconClassName: "text-red-600",
    icon: X
  },
  skipped: {
    label: "Skipped",
    badgeClassName: "border-neutral-200 bg-neutral-100 text-neutral-600",
    iconClassName: "text-neutral-500",
    icon: Minus
  },
  cancelled: {
    label: "Cancelled",
    badgeClassName: "border-neutral-200 bg-neutral-100 text-neutral-600",
    iconClassName: "text-neutral-500",
    icon: X
  }
};

export function getStatusPresentation(status: string) {
  return statusPresentation[status as ProductStatus] ?? {
    label: status.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase()),
    badgeClassName: "border-neutral-200 bg-neutral-100 text-neutral-700",
    iconClassName: "text-neutral-500",
    icon: Circle
  };
}
