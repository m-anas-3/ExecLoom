"use client";

import { Braces, LoaderCircle, Play } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatJson, parseJsonObject } from "@/lib/json-authoring";

export function RunWorkflowDialog({ open, versionNo, onClose, onRun }: {
  open: boolean;
  versionNo: number;
  onClose: () => void;
  onRun: (input: Record<string, unknown>) => Promise<void>;
}) {
  const [inputText, setInputText] = useState("{}");
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  async function submit() {
    setError(null);
    let input: Record<string, unknown>;

    try {
      input = parseJsonObject(inputText, "Execution input");
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Execution input is invalid");
      return;
    }

    setIsRunning(true);
    try {
      await onRun(input);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unable to start execution");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && !isRunning && onClose()}>
      <DialogContent className="gap-0 overflow-hidden border-neutral-200 bg-white p-0 sm:max-w-lg" onEscapeKeyDown={(event) => isRunning && event.preventDefault()} onPointerDownOutside={(event) => isRunning && event.preventDefault()}>
        <DialogHeader className="border-b border-neutral-200 px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-base text-neutral-950">Run workflow</DialogTitle>
          <DialogDescription className="text-xs text-neutral-500">Execute active published version {versionNo}.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="execution-input">Execution input (JSON)</Label>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => {
              try {
                setInputText(formatJson(JSON.parse(inputText)));
                setError(null);
              } catch {
                setError("Execution input must be valid JSON.");
              }
            }}>
              <Braces className="size-3.5" />Format
            </Button>
          </div>
          <Textarea id="execution-input" value={inputText} onChange={(event) => setInputText(event.target.value)} className="min-h-48 resize-y font-mono text-xs leading-5" aria-invalid={Boolean(error)} autoFocus />
          {error ? <p className="text-xs text-red-600" role="alert">{error}</p> : <p className="text-xs text-neutral-500">Input must be a JSON object.</p>}
        </div>
        <DialogFooter className="border-t border-neutral-200 bg-neutral-50 px-5 py-3">
          <Button type="button" variant="outline" disabled={isRunning} onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={isRunning} onClick={() => void submit()}>
            {isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
            Run version {versionNo}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
