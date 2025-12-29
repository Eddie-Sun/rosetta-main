import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { CompanyForm } from "./CompanyForm";

export default async function Page() {
  const { userId } = await auth();
  if (!userId) redirect("/onboarding");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 items-center px-6 py-12">
      <CompanyForm />
    </main>
  );
}






