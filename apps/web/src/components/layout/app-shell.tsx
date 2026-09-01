"use client";

import { Boxes, LogOut, Menu, Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  function logout() {
    setMobileNavigationOpen(false);
    auth.logout();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-neutral-50 xl:grid xl:grid-cols-[224px_minmax(0,1fr)]">
      <aside className="hidden min-h-screen border-r border-neutral-800 bg-neutral-950 text-white xl:sticky xl:top-0 xl:flex xl:h-screen xl:flex-col">
        <WorkspaceNavigation
          pathname={pathname}
          email={auth.user?.email}
          onNavigate={() => undefined}
          onLogout={logout}
        />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-neutral-200 bg-white px-4 xl:hidden">
          <Link href="/workflows" className="flex items-center gap-2 text-sm font-semibold text-neutral-950">
            <BrandMark compact />
            ExecLoom
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
            title="Open navigation"
            onClick={() => setMobileNavigationOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
        </header>

        <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
          <SheetContent
            side="left"
            className="w-[280px] gap-0 border-neutral-800 bg-neutral-950 p-0 text-white sm:max-w-[280px]"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Workspace navigation</SheetTitle>
              <SheetDescription>Navigate through the ExecLoom workspace.</SheetDescription>
            </SheetHeader>
            <WorkspaceNavigation
              pathname={pathname}
              email={auth.user?.email}
              onNavigate={() => setMobileNavigationOpen(false)}
              onLogout={logout}
            />
          </SheetContent>
        </Sheet>

        {children}
      </div>
    </div>
  );
}

function WorkspaceNavigation({
  pathname,
  email,
  onNavigate,
  onLogout
}: {
  pathname: string;
  email?: string;
  onNavigate: () => void;
  onLogout: () => void;
}) {
  const workflowsActive = pathname.startsWith("/workflows");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-neutral-800 px-5 text-sm font-semibold">
        <BrandMark />
        ExecLoom
      </div>
      <nav className="flex-1 px-3 py-4" aria-label="Workspace navigation">
        <Link
          href="/workflows"
          onClick={onNavigate}
          className={cn(
            "relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
            workflowsActive
              ? "bg-neutral-800 text-white"
              : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
          )}
        >
          {workflowsActive ? <span className="absolute inset-y-2 left-0 w-0.5 rounded bg-sky-400" /> : null}
          <Boxes className="size-4" />
          Workflows
        </Link>
      </nav>
      <div className="shrink-0 border-t border-neutral-800 p-3">
        <div className="mb-2 min-w-0 px-2 py-1">
          <p className="text-[11px] font-medium uppercase text-neutral-500">Signed in</p>
          <p className="mt-1 truncate text-sm text-neutral-200">{email}</p>
        </div>
        <button
          type="button"
          className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          onClick={onLogout}
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-md",
        compact ? "size-7 bg-neutral-950 text-white" : "size-8 bg-white text-neutral-950"
      )}
    >
      <Workflow className={compact ? "size-3.5" : "size-4"} />
    </span>
  );
}
