import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function Page() {
  const { userId } = await auth();
  if (userId) {
    redirect("/onboarding/company");
  }

  return (
    <main className="flex min-h-[calc(100vh-var(--site-header-height))] w-full items-center justify-center px-6 py-12">
      <SignIn routing="path" path="/onboarding" signUpUrl="/sign-up" afterSignInUrl="/onboarding/company" />
    </main>
  );
}






