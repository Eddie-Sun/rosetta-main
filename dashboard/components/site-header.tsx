"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignedIn, UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { SidebarTrigger } from "@/components/ui/sidebar";

function titleForPath(pathname: string): string {
  if (pathname === "/overview") return "Overview";
  if (pathname.startsWith("/onboarding")) return "Onboarding";
  return "Dashboard";
}

export function SiteHeader({ className }: { className?: string }) {
  const pathname = usePathname() ?? "/";
  const title = titleForPath(pathname);

  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-[var(--header-height)] items-center justify-between border-b border-border bg-background/80 backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center gap-3 px-4 lg:px-6">
        <SidebarTrigger />
        <div className="text-[14px] font-semibold tracking-tight">{title}</div>
        <div className="hidden sm:block text-[13px] text-muted-foreground">
          <Link className="hover:text-foreground" href="/overview">
            Home
          </Link>
          <span className="px-2">/</span>
          <span className="text-foreground">{title}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 lg:px-6">
        <Link
          className="hidden sm:inline-flex items-center text-[13px] text-muted-foreground hover:text-foreground"
          href="/"
        >
          Marketing site
        </Link>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </div>
    </header>
  );
}


