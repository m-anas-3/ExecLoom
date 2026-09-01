"use client";

import type {
  CreateCredentialRequest,
  CredentialResponse,
  CredentialType,
  UpdateCredentialRequest
} from "@execloom/contracts";
import {
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";
import {
  ApiError,
  archiveCredential,
  createCredential,
  listCredentials,
  updateCredential
} from "@/lib/api";

export function CredentialsScreen() {
  const { accessToken } = useAuth();
  const [credentials, setCredentials] = useState<CredentialResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingCredential, setEditingCredential] = useState<CredentialResponse | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<CredentialResponse | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  const loadCredentials = useCallback(async () => {
    if (!accessToken) return;

    setIsLoading(true);

    try {
      const response = await listCredentials(accessToken);
      setCredentials(response.credentials);
      setRequestError(null);
    } catch (error) {
      setRequestError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadCredentials();
  }, [loadCredentials]);

  function openCreateDialog() {
    setEditingCredential(null);
    setFormOpen(true);
    setNotice(null);
  }

  function openEditDialog(credential: CredentialResponse) {
    setEditingCredential(credential);
    setFormOpen(true);
    setNotice(null);
  }

  async function handleArchive() {
    if (!accessToken || !archiveTarget) return;

    setIsArchiving(true);

    try {
      await archiveCredential(accessToken, archiveTarget.id);
      setCredentials((current) => current.filter((item) => item.id !== archiveTarget.id));
      setNotice(`Archived ${archiveTarget.name}.`);
      setArchiveTarget(null);
      setRequestError(null);
    } catch (error) {
      setRequestError(getErrorMessage(error));
      setArchiveTarget(null);
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-56px)] bg-workspace xl:min-h-screen">
      <div className="mx-auto max-w-[1400px] px-4 py-7 sm:px-6 lg:px-8">
        <header className="flex flex-col justify-between gap-4 border-b border-neutral-200 pb-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase text-neutral-500">Workspace security</p>
            <h1 className="mt-1 text-2xl font-semibold text-neutral-950">Credentials</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Manage encrypted authentication used by HTTP workflow steps.
            </p>
          </div>
          <Button variant="accent" onClick={openCreateDialog}>
            <Plus className="size-4" />
            New credential
          </Button>
        </header>

        {requestError ? (
          <InlineNotice variant="error" className="mt-5" title="Credential request failed">
            {requestError}
          </InlineNotice>
        ) : null}
        {notice ? (
          <InlineNotice variant="success" className="mt-5">
            {notice}
          </InlineNotice>
        ) : null}

        {isLoading ? (
          <CredentialLoading />
        ) : credentials.length === 0 ? (
          <div className="mt-5 rounded-md border border-neutral-200 bg-white">
            <EmptyState
              icon={KeyRound}
              title="No credentials"
              description="Create an API key or Bearer token before connecting an authenticated HTTP step."
              action={<Button variant="accent" onClick={openCreateDialog}><Plus className="size-4" />New credential</Button>}
            />
          </div>
        ) : (
          <CredentialList
            credentials={credentials}
            onEdit={openEditDialog}
            onArchive={setArchiveTarget}
          />
        )}
      </div>

      <CredentialFormDialog
        open={formOpen}
        credential={editingCredential}
        onOpenChange={setFormOpen}
        onSaved={(saved) => {
          setCredentials((current) => {
            const existing = current.some((item) => item.id === saved.id);
            return existing
              ? current.map((item) => (item.id === saved.id ? saved : item))
              : [saved, ...current];
          });
          setNotice(editingCredential ? `Updated ${saved.name}.` : `Created ${saved.name}.`);
          setRequestError(null);
        }}
      />

      <Dialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive credential?</DialogTitle>
            <DialogDescription>
              {archiveTarget?.name} will no longer be available to workflow steps. Credentials used by an active published workflow cannot be archived.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={isArchiving} onClick={() => void handleArchive()}>
              {isArchiving ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function CredentialList({
  credentials,
  onEdit,
  onArchive
}: {
  credentials: CredentialResponse[];
  onEdit: (credential: CredentialResponse) => void;
  onArchive: (credential: CredentialResponse) => void;
}) {
  return (
    <section className="mt-5 overflow-hidden rounded-md border border-neutral-200 bg-white">
      <div className="hidden grid-cols-[minmax(220px,1fr)_180px_200px_100px] gap-4 border-b border-neutral-200 bg-neutral-50 px-4 py-2.5 text-xs font-medium text-neutral-500 md:grid">
        <span>Name</span><span>Type</span><span>Updated</span><span className="text-right">Actions</span>
      </div>
      {credentials.map((credential) => {
        const Icon = credential.type === "api_key" ? KeyRound : ShieldCheck;

        return (
          <div key={credential.id} className="grid gap-3 border-b border-neutral-200 px-4 py-4 last:border-b-0 md:grid-cols-[minmax(220px,1fr)_180px_200px_100px] md:items-center md:gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-md border border-neutral-200 bg-neutral-50 text-neutral-600"><Icon className="size-4" /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-950">{credential.name}</p>
                <p className="mt-0.5 truncate text-xs text-neutral-500">{credential.type === "api_key" ? credential.headerName : "Authorization header"}</p>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm text-neutral-700 md:block"><span className="text-xs text-neutral-500 md:hidden">Type</span><span>{formatCredentialType(credential.type)}</span></div>
            <div className="flex items-center justify-between text-xs text-neutral-600 md:block"><span className="text-neutral-500 md:hidden">Updated</span><span>{formatDate(credential.updatedAt)}</span></div>
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" title="Edit credential" aria-label={`Edit ${credential.name}`} onClick={() => onEdit(credential)}><Pencil className="size-4" /></Button>
              <Button variant="ghost" size="icon" className="text-neutral-500 hover:text-red-600" title="Archive credential" aria-label={`Archive ${credential.name}`} onClick={() => onArchive(credential)}><Trash2 className="size-4" /></Button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function CredentialFormDialog({
  open,
  credential,
  onOpenChange,
  onSaved
}: {
  open: boolean;
  credential: CredentialResponse | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (credential: CredentialResponse) => void;
}) {
  const { accessToken } = useAuth();
  const [type, setType] = useState<CredentialType>("api_key");
  const [name, setName] = useState("");
  const [headerName, setHeaderName] = useState("x-api-key");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(credential?.type ?? "api_key");
    setName(credential?.name ?? "");
    setHeaderName(credential?.headerName ?? "x-api-key");
    setSecret("");
    setShowSecret(false);
    setError(null);
  }, [credential, open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;

    if (!name.trim() || (!credential && !secret)) {
      setError("Name and secret are required.");
      return;
    }

    if (type === "api_key" && !headerName.trim()) {
      setError("API key header name is required.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      let saved: CredentialResponse;

      if (credential) {
        const input: UpdateCredentialRequest = {
          name: name.trim(),
          ...(secret ? { secret } : {}),
          ...(credential.type === "api_key" ? { headerName: headerName.trim() } : {})
        };
        saved = await updateCredential(accessToken, credential.id, input);
      } else {
        const input: CreateCredentialRequest = type === "api_key"
          ? { type, name: name.trim(), secret, headerName: headerName.trim() }
          : { type, name: name.trim(), secret };
        saved = await createCredential(accessToken, input);
      }

      onSaved(saved);
      onOpenChange(false);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{credential ? "Edit credential" : "Create credential"}</DialogTitle>
            <DialogDescription>Secrets are encrypted and cannot be viewed again after saving.</DialogDescription>
          </DialogHeader>
          {error ? <InlineNotice variant="error">{error}</InlineNotice> : null}
          <div className="grid gap-2">
            <Label htmlFor="credential-type">Type</Label>
            <select id="credential-type" className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-brand disabled:bg-neutral-100" value={type} disabled={Boolean(credential)} onChange={(event) => setType(event.target.value as CredentialType)}>
              <option value="api_key">API key</option>
              <option value="bearer_token">Bearer token</option>
            </select>
          </div>
          <div className="grid gap-2"><Label htmlFor="credential-name">Name</Label><Input id="credential-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Production API" /></div>
          {type === "api_key" ? <div className="grid gap-2"><Label htmlFor="credential-header">Header name</Label><Input id="credential-header" value={headerName} maxLength={120} onChange={(event) => setHeaderName(event.target.value)} placeholder="x-api-key" /></div> : null}
          <div className="grid gap-2">
            <Label htmlFor="credential-secret">{credential ? "New secret (optional)" : "Secret"}</Label>
            <div className="relative"><Input id="credential-secret" type={showSecret ? "text" : "password"} className="pr-10" value={secret} maxLength={4096} autoComplete="new-password" onChange={(event) => setSecret(event.target.value)} /><Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 size-9" aria-label={showSecret ? "Hide secret" : "Show secret"} onClick={() => setShowSecret((current) => !current)}>{showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button></div>
            {credential ? <p className="text-xs text-neutral-500">Leave blank to keep the existing encrypted secret.</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="accent" disabled={isSaving}>{isSaving ? <LoaderCircle className="size-4 animate-spin" /> : null}{credential ? "Save changes" : "Create credential"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CredentialLoading() {
  return <div className="mt-5 overflow-hidden rounded-md border border-neutral-200 bg-white">{[0, 1, 2].map((row) => <div key={row} className="flex items-center gap-3 border-b border-neutral-200 p-4 last:border-b-0"><Skeleton className="size-9" /><div className="grid flex-1 gap-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-24" /></div></div>)}</div>;
}

function formatCredentialType(type: CredentialType): string {
  return type === "api_key" ? "API key" : "Bearer token";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return "The credential request could not be completed.";
}
