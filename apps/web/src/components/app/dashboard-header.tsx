import { LogOut, RefreshCw, Workflow } from "lucide-react";

import type { AuthUserResponse } from "@execloom/contracts";

import { Button } from "@/components/ui/button";

export function DashboardHeader({
  user,
  onLogout,
  onRefresh
}: {
  user: AuthUserResponse;
  onLogout: () => void;
  onRefresh: () => void;
}) {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <Workflow className="size-5 text-emerald-600" />
            <h1 className="text-lg font-semibold">ExecLoom</h1>
          </div>
          <p className="text-sm text-neutral-600">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button variant="ghost" size="icon" aria-label="Log out" onClick={onLogout}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
