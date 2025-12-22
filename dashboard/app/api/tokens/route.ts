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

    // Get customer with domains
    const customer = await prisma.customer.findUnique({
      where: { clerkUserId: userId },
      include: {
        domains: true,
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { label } = body;

    // Get customer domains (normalized hostnames)
    const domains = customer.domains.map((d) => d.hostname);

    if (domains.length === 0) {
      return NextResponse.json(
        { error: "No domains configured. Please add a domain first." },
        { status: 400 }
      );
    }

    // Create token
    const result = await createApiTokenForCustomer({
      customerId: customer.id,
      domains,
      plan: customer.plan,
      label: label || null,
    });

    return NextResponse.json({
      token: result.token,
      prefix: result.prefix,
      label: label || null,
    });
  } catch (error) {
    console.error("Error creating token:", error);
    const message = error instanceof Error ? error.message : "Failed to create token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

