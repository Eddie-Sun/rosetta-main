import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerId, url, htmlTokens, mdTokens, optimizedAt } = body;

    // Validate required fields
    if (!customerId || !url || htmlTokens === undefined || mdTokens === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: customerId, url, htmlTokens, mdTokens" },
        { status: 400 }
      );
    }

    // Normalize URL (should match worker canonicalization)
    // Worker uses canonicalize() which removes tracking params, normalizes hostname, etc.
    // For now, just use the URL as-is since worker sends canonicalized URL
    const normalizedUrl = url;

    // Upsert metrics
    await prisma.urlMetrics.upsert({
      where: {
        customerId_url: {
          customerId,
          url: normalizedUrl,
        },
      },
      create: {
        customerId,
        url: normalizedUrl,
        htmlTokens,
        mdTokens,
        optimizedAt: optimizedAt ? new Date(optimizedAt) : new Date(),
      },
      update: {
        htmlTokens,
        mdTokens,
        optimizedAt: optimizedAt ? new Date(optimizedAt) : new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving token metrics:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

