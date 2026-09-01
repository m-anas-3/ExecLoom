import { AlertCircle, CheckCircle2, CircleAlert, Info } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const noticeStyle = {
  info: {
    icon: Info,
    className: "border-sky-200 bg-sky-50 text-sky-800",
    iconClassName: "text-sky-600"
  },
  success: {
    icon: CheckCircle2,
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    iconClassName: "text-emerald-600"
  },
  warning: {
    icon: CircleAlert,
    className: "border-amber-200 bg-amber-50 text-amber-900",
    iconClassName: "text-amber-600"
  },
  error: {
    icon: AlertCircle,
    className: "border-red-200 bg-red-50 text-red-800",
    iconClassName: "text-red-600"
  }
} as const;

export function InlineNotice({
  variant = "info",
  title,
  children,
  action,
  className
}: {
  variant?: keyof typeof noticeStyle;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const style = noticeStyle[variant];
  const Icon = style.icon;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm",
        style.className,
        className
      )}
      role={variant === "error" ? "alert" : "status"}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", style.iconClassName)} />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className={cn("leading-5", title ? "mt-0.5 text-current/80" : "")}>{children}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
