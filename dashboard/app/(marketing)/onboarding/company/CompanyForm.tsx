"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { submitCompanyInfo } from "./actions";

export function CompanyForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await submitCompanyInfo(formData);

      if (result.ok) {
        router.push("/overview");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card className="w-full p-6 sm:p-8">
      <h1 className="text-[22px] font-semibold tracking-tight">Company Information</h1>
      <p className="mt-3 text-[14px] text-muted-foreground">
        Tell us about your company to get started.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {error && (
          <div className="p-3 text-[14px] text-red-600 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="companyName" className="block text-[14px] font-medium mb-2">
            Company Name
          </label>
          <input
            type="text"
            id="companyName"
            name="companyName"
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-[14px] focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="Enter your company name (optional)"
            disabled={isPending}
          />
        </div>

        <div>
          <label htmlFor="domain" className="block text-[14px] font-medium mb-2">
            Domain
          </label>
          <input
            type="text"
            id="domain"
            name="domain"
            required
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-[14px] focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="example.com"
            disabled={isPending}
          />
          <p className="mt-1 text-[12px] text-muted-foreground">
            Enter your domain without http:// or https://
          </p>
        </div>

        <div className="pt-4">
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Saving..." : "Continue"}
          </Button>
        </div>
      </form>
    </Card>
  );
}


