import { History, Loader2, Rocket, ShieldCheck, Workflow } from "lucide-react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type AuthMode = "login" | "register";

export function AuthScreen({
  authMode,
  email,
  error,
  isBusy,
  password,
  onAuthModeChange,
  onEmailChange,
  onPasswordChange,
  onSubmit
}: {
  authMode: AuthMode;
  email: string;
  error: string | null;
  isBusy: boolean;
  password: string;
  onAuthModeChange: (mode: AuthMode) => void;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="grid min-h-screen grid-cols-1 bg-neutral-950 text-white lg:grid-cols-[1.1fr_0.9fr]">
      <section className="flex min-h-[42vh] flex-col justify-between px-6 py-8 sm:px-10 lg:min-h-screen">
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-300">
          <Workflow className="size-5 text-emerald-300" />
          ExecLoom
        </div>
        <div className="max-w-2xl">
          <p className="mb-4 text-sm font-medium text-emerald-300">
            Workflow execution platform
          </p>
          <h1 className="text-4xl font-semibold tracking-normal text-white sm:text-5xl">
            Build, publish, and run backend workflows from one control plane.
          </h1>
        </div>
        <div className="grid gap-3 text-sm text-neutral-300 sm:grid-cols-3">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="size-4 text-sky-300" />
            Typed contracts
          </span>
          <span className="inline-flex items-center gap-2">
            <Rocket className="size-4 text-emerald-300" />
            Worker pipeline
          </span>
          <span className="inline-flex items-center gap-2">
            <History className="size-4 text-amber-300" />
            Execution history
          </span>
        </div>
      </section>

      <section className="flex items-center justify-center bg-neutral-100 px-4 py-8 text-neutral-950">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{authMode === "login" ? "Sign in" : "Create account"}</CardTitle>
            <CardDescription>Use your local ExecLoom API credentials.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={onSubmit}>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => onEmailChange(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  minLength={authMode === "register" ? 8 : 1}
                  value={password}
                  onChange={(event) => onPasswordChange(event.target.value)}
                  required
                />
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <Button type="submit" disabled={isBusy}>
                {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                {authMode === "login" ? "Sign in" : "Create account"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onAuthModeChange(authMode === "login" ? "register" : "login")}
              >
                {authMode === "login" ? "Need an account?" : "Already have an account?"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
