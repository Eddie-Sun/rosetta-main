"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Globe,
  KeyRound,
} from "lucide-react";

const navItems = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/onboarding/company", label: "Company", icon: Globe },
  { href: "/onboarding/token", label: "API Token", icon: KeyRound },
];

export function AppSidebar({
  variant = "inset",
  className,
}: {
  variant?: "inset";
  className?: string;
}) {
  const { open } = useSidebar();

  return (
    <aside
      className={cn(
        "w-[var(--sidebar-width)] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground hidden",
        open ? "md:flex" : "md:hidden",
        variant === "inset" ? "px-2 py-3" : "",
        className,
      )}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <Link href="/overview" className="text-[14px] font-semibold tracking-tight">
          Rosetta
        </Link>
        <div className="text-[12px] text-muted-foreground">Dashboard</div>
      </div>

      <nav className="mt-2 flex flex-1 flex-col gap-1 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 border border-transparent px-3 py-2 text-[14px] text-sidebar-foreground hover:bg-[var(--bg-hover)]",
              )}
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}


