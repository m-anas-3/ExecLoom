"use client";

import { Eye, EyeOff, LoaderCircle, LockKeyhole, Workflow } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/auth-context";
import { ApiError } from "@/lib/api";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
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
    <main className="flex min-h-screen flex-col bg-workspace">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-5 sm:px-8">
        <Link href="/" className="inline-flex items-center gap-2.5 text-sm font-semibold text-neutral-950">
          <span className="grid size-8 place-items-center rounded-md bg-brand-soft text-brand">
            <Workflow className="size-4" />
          </span>
          ExecLoom
        </Link>
        <span className="hidden text-xs text-neutral-500 sm:block">Workflow operations workspace</span>
      </header>

      <section className="grid flex-1 place-items-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-[420px]">
          <div className="mb-6 text-center">
            <span className="mx-auto grid size-10 place-items-center rounded-md border border-brand/20 bg-brand-soft text-brand">
              <LockKeyhole className="size-4" />
            </span>
            <h1 className="mt-4 text-xl font-semibold text-neutral-950">
              {isLogin ? "Sign in to ExecLoom" : "Create your account"}
            </h1>
            <p className="mt-1 text-sm text-neutral-600">
              {isLogin ? "Access your workflow workspace." : "Set up your workflow workspace."}
            </p>
          </div>

          <div className="rounded-md border border-neutral-200 bg-white shadow-sm">
            <form className="grid gap-4 p-5 sm:p-6" onSubmit={handleSubmit}>
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
                  className="focus:border-brand focus:ring-2 focus:ring-brand/15"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={passwordVisible ? "text" : "password"}
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    minLength={isLogin ? 1 : 8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="pr-10 focus:border-brand focus:ring-2 focus:ring-brand/15"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1 grid size-7 place-items-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    aria-label={passwordVisible ? "Hide password" : "Show password"}
                    onClick={() => setPasswordVisible((visible) => !visible)}
                  >
                    {passwordVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {!isLogin ? <p className="text-xs text-neutral-500">Use at least 8 characters.</p> : null}
              </div>

              {error ? <InlineNotice variant="error">{error}</InlineNotice> : null}

              <Button variant="accent" className="mt-1 w-full" type="submit" disabled={isSubmitting}>
                {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
                {isLogin ? "Sign in" : "Create account"}
              </Button>
            </form>

            <div className="border-t border-neutral-200 bg-neutral-50 px-5 py-4 text-center text-sm text-neutral-600 sm:px-6">
              {isLogin ? "New to ExecLoom?" : "Already have an account?"}{" "}
              <Link className="font-medium text-brand underline-offset-4 hover:text-brand-hover hover:underline" href={isLogin ? "/register" : "/login"}>
                {isLogin ? "Create account" : "Sign in"}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function getAuthError(error: unknown, isLogin: boolean) {
  if (error instanceof ApiError) {
    if (error.statusCode === 401) return "Email or password is incorrect.";
    if (error.statusCode === 409) return "An account already exists for this email.";
    return error.message;
  }

  return isLogin ? "Unable to sign in. Try again." : "Unable to create the account. Try again.";
}
