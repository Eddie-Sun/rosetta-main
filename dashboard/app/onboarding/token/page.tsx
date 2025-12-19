import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";

export default async function OnboardingTokenPage(): Promise<JSX.Element> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 items-center px-6 py-12">
      <Card className="w-full p-6 sm:p-8">
        <h1 className="text-[22px] font-semibold tracking-tight">Get API token</h1>
        <p className="mt-3 text-[14px] text-muted-foreground">
          Placeholder for now. Next step is provisioning a token in KV.
        </p>

        <div className="mt-6">
          <Link className="text-accent hover:underline underline-offset-4" href="/onboarding">
            ← Back
          </Link>
        </div>
      </Card>
    </main>
  );
}


