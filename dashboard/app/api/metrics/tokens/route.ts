import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const expected = process.env.DASHBOARD_API_KEY;
  const auth = request.headers.get("authorization");
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      customerId?: string;
      url?: string;
      htmlTokens?: number | null;
      mdTokens?: number | null;
      optimizedAt?: string | Date | null;
    };
    const { customerId, url, htmlTokens, mdTokens, optimizedAt } = body;

    if (!customerId || !url || htmlTokens === undefined || mdTokens === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: customerId, url, htmlTokens, mdTokens" },
        { status: 400 }
      );
    }

    await prisma.urlMetrics.upsert({
      where: {
        customerId_url: {
          customerId,
          url,
        },
      },
      create: {
        customerId,
        url,
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

