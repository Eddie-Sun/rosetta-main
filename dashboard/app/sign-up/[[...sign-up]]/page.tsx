import { SignUp } from "@clerk/nextjs";

export default function Page(): JSX.Element {
  return (
    <main className="flex min-h-[calc(100vh-var(--site-header-height))] w-full items-center justify-center px-6 py-12">
      <SignUp />
    </main>
  );
}


