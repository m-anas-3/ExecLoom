import type { Metadata } from "next";
import type { ReactNode } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/auth-context";

import "@xyflow/react/dist/style.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ExecLoom",
  description: "Visual workflow builder and execution workspace"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <TooltipProvider delayDuration={350}>
          <AuthProvider>{children}</AuthProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
