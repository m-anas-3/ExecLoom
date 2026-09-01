"use client";

import { LoaderCircle } from "lucide-react";
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
    <main className="grid min-h-screen place-items-center bg-neutral-50">
      <LoaderCircle className="size-5 animate-spin text-neutral-500" aria-label="Loading" />
    </main>
  );
}
