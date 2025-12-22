import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Get customer
    const customer = await prisma.customer.findUnique({
      where: { clerkUserId: userId },
      include: {
        apiTokens: {
          where: { revokedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    if (customer.apiTokens.length === 0) {
      return NextResponse.json(
        { error: "No API token found. Please create an API token first." },
        { status: 400 }
      );
    }

    // Get worker API URL
    const workerApiUrl =
      process.env.NEXT_PUBLIC_WORKER_API_URL ||
      process.env.WORKER_API_URL ||
      "https://api.rosetta.ai";

    // Note: We need the plaintext token to call the worker API
    // For MVP, we'll use an environment variable for a service token
    // TODO: Implement proper token retrieval/storage mechanism
    // In production, you'd store plaintext tokens securely (encrypted) or use a service account
    const serviceToken = process.env.ROSETTA_SERVICE_TOKEN;
    
    if (!serviceToken) {
      // For development, try to use the token prefix (won't work but allows testing)
      // In production, this should be a proper service token
      return NextResponse.json(
        { error: "Service token not configured. Please set ROSETTA_SERVICE_TOKEN environment variable." },
        { status: 500 }
      );
    }

    // Call worker API to trigger optimization
    // This will cause the worker to extract the page, count tokens, and send metrics back
    const response = await fetch(`${workerApiUrl}/render?url=${encodeURIComponent(url)}`, {
      method: "GET",
      headers: {
        "X-Rosetta-Token": serviceToken,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Worker API error: ${response.status} ${errorText}` },
        { status: response.status }
      );
    }

    // Wait a moment for metrics to be processed and sent to dashboard
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error checking URL:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

