import Link from "next/link";
import {
  SignedIn,
  UserButton,
} from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.NODE_ENV === "development";
  const hasClerkKeys = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );

  return (
    <div className="min-h-screen pt-[var(--site-header-height)]">
      <header className="fixed top-0 left-0 z-50 w-full bg-background">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div
            className="grid h-[var(--site-header-height)] grid-cols-[auto_1fr_auto] items-center gap-6"
            role="navigation"
          >
            <Link
              href="/"
              aria-label="Homepage"
              className="relative inline-flex items-center leading-none"
            >
              <span className="text-[16px] font-semibold tracking-tight">Rosetta</span>
            </Link>

            <nav className="hidden lg:flex items-center justify-center gap-6 text-[14px] text-muted-foreground">
              <Link className="hover:text-foreground" href="/#features">
                Features
              </Link>
              <Link className="hover:text-foreground" href="/#enterprise">
                Enterprise
              </Link>
              <Link className="hover:text-foreground" href="/#pricing">
                Pricing
              </Link>
              <Link className="hover:text-foreground" href="/#resources">
                Resources
              </Link>
            </nav>

            <div className="flex items-center justify-end gap-3">
              <Button size="sm" asChild>
                <Link href="/sign-up">Get started</Link>
              </Button>
              <SignedIn>
                <UserButton />
              </SignedIn>
            </div>
          </div>
        </div>
      </header>

      {isDev && !hasClerkKeys ? (
        <div className="mx-auto w-full max-w-6xl px-6 pt-4">
          <div className="border border-border bg-card px-3 py-2 text-[13px] text-muted-foreground">
            Clerk is running in <span className="text-foreground">keyless mode</span>. For stable dev,
            copy <span className="text-foreground">clerk.env.example</span> to{" "}
            <span className="text-foreground">.env.local</span> and add keys.
          </div>
        </div>
      ) : null}

      {children}
    </div>
  );
}



