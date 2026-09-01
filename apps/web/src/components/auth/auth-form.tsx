"use client";

import { AlertCircle, LoaderCircle, Workflow } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/auth-context";
import { ApiError } from "@/lib/api";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isLogin = mode === "login";

  useEffect(() => {
    if (auth.status === "authenticated") {
      router.replace("/workflows");
    }
  }, [auth.status, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (isLogin) {
        await auth.login(email, password);
      } else {
        await auth.register(email, password);
      }

      router.replace("/workflows");
    } catch (requestError) {
      setError(getAuthError(requestError, isLogin));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-neutral-100 lg:grid-cols-[minmax(280px,0.7fr)_minmax(440px,1.3fr)]">
      <section className="hidden border-r border-neutral-800 bg-neutral-950 px-10 py-9 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold">
          <span className="grid size-8 place-items-center rounded-md bg-white text-neutral-950">
            <Workflow className="size-4" />
          </span>
          ExecLoom
        </Link>
        <div className="max-w-sm">
          <p className="text-2xl font-semibold leading-tight">Workflow operations, in one place.</p>
          <p className="mt-3 text-sm leading-6 text-neutral-400">
            Author linear workflows, publish immutable versions, and inspect every execution.
          </p>
        </div>
        <p className="text-xs text-neutral-500">Technical workflow workspace</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[420px]">
          <Link href="/" className="mb-10 inline-flex items-center gap-2 font-semibold lg:hidden">
            <span className="grid size-8 place-items-center rounded-md bg-neutral-950 text-white">
              <Workflow className="size-4" />
            </span>
            ExecLoom
          </Link>
          <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6">
              <p className="text-xl font-semibold text-neutral-950">
                {isLogin ? "Sign in" : "Create your account"}
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                {isLogin ? "Continue to your workflow workspace." : "Start building workflows."}
              </p>
            </div>

            <form className="grid gap-4" onSubmit={handleSubmit}>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  minLength={isLogin ? 1 : 8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                {!isLogin ? (
                  <p className="text-xs text-neutral-500">Use at least 8 characters.</p>
                ) : null}
              </div>

              {error ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}

              <Button className="mt-1 w-full" type="submit" disabled={isSubmitting}>
                {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
                {isLogin ? "Sign in" : "Create account"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-neutral-600">
              {isLogin ? "New to ExecLoom?" : "Already have an account?"}{" "}
              <Link
                className="font-medium text-neutral-950 underline-offset-4 hover:underline"
                href={isLogin ? "/register" : "/login"}
              >
                {isLogin ? "Create account" : "Sign in"}
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function getAuthError(error: unknown, isLogin: boolean) {
  if (error instanceof ApiError) {
    if (error.statusCode === 401) {
      return "Email or password is incorrect.";
    }

    if (error.statusCode === 409) {
      return "An account already exists for this email.";
    }

    return error.message;
  }

  return isLogin ? "Unable to sign in. Try again." : "Unable to create the account. Try again.";
}
