import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { createApiTokenForCustomer } from "@/lib/tokens";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const customer = await prisma.customer.findUnique({
      where: { clerkUserId: userId },
      include: {
        domains: true,
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as { label?: string | null } | null;
    const label = body?.label ?? null;

    const domains = customer.domains.map((d) => d.hostname);

    if (domains.length === 0) {
      return NextResponse.json(
        { error: "No domains configured. Please add a domain first." },
        { status: 400 }
      );
    }

    const result = await createApiTokenForCustomer({
      customerId: customer.id,
      domains,
      plan: customer.plan,
      label,
    });

    return NextResponse.json({
      token: result.token,
      prefix: result.prefix,
      label,
    });
  } catch (error) {
    console.error("Error creating token:", error);
    const message = error instanceof Error ? error.message : "Failed to create token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

