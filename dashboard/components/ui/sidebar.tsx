"use client";

import * as React from "react";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type SidebarContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within a SidebarProvider");
  return ctx;
}

export function SidebarProvider({
  children,
  className,
  style,
}: React.PropsWithChildren<{
  className?: string;
  style?: React.CSSProperties;
}>) {
  const [open, setOpen] = React.useState(true);
  const toggle = React.useCallback(() => setOpen((v) => !v), []);

  return (
    <SidebarContext.Provider value={{ open, setOpen, toggle }}>
      <div
        className={cn("flex min-h-svh w-full bg-background text-foreground", className)}
        style={style}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function SidebarInset({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn("flex min-h-svh flex-1 flex-col bg-background", className)}>
      {children}
    </div>
  );
}

export function SidebarTrigger({
  className,
}: {
  className?: string;
}) {
  const { toggle } = useSidebar();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      className={cn("text-muted-foreground hover:text-foreground", className)}
      aria-label="Toggle sidebar"
    >
      <PanelLeft className="h-4 w-4" />
    </Button>
  );
}


