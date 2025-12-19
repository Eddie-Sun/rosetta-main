import Link from "next/link";
import { Card } from "@/components/ui/card";

export default function RequestAccessPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 items-center px-6 py-12">
      <Card className="w-full p-6 sm:p-8">
        <h1 className="text-[22px] font-semibold tracking-tight">Request access</h1>
        <p className="mt-3 text-[14px] text-muted-foreground">
          If you need to use a personal email, send us a note with your intended domain.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            className="inline-flex h-10 items-center border border-border bg-background px-3 text-[14px] hover:bg-[var(--bg-hover)]"
            href="mailto:founders@rosetta.ai?subject=Rosetta%20access%20request"
          >
            Email founders@rosetta.ai
          </a>
          <Link
            className="inline-flex h-10 items-center border border-border bg-background px-3 text-[14px] hover:bg-[var(--bg-hover)]"
            href="/onboarding"
          >
            Back to onboarding
          </Link>
        </div>
      </Card>
    </main>
  );
}


