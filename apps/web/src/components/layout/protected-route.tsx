"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/contexts/auth-context";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, status]);

  if (status !== "authenticated") {
    return (
      <main className="grid min-h-screen place-items-center bg-neutral-50">
        <LoaderCircle className="size-5 animate-spin text-neutral-500" aria-label="Loading" />
      </main>
    );
  }

  return children;
}
