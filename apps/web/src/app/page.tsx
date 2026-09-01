"use client";

import { LoaderCircle, Workflow } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/contexts/auth-context";

export default function HomePage() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/workflows");
    }

    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, status]);

  return (
    <main className="grid min-h-screen place-items-center bg-workspace">
      <div className="grid place-items-center text-center">
        <span className="grid size-10 place-items-center rounded-md bg-brand-soft text-brand">
          <Workflow className="size-5" />
        </span>
        <LoaderCircle className="mt-4 size-4 animate-spin text-neutral-500" aria-label="Loading workspace" />
        <p className="mt-2 text-xs text-neutral-500">Opening ExecLoom</p>
      </div>
    </main>
  );
}
