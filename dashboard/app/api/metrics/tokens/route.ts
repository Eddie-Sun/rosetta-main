import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function readNumberOrNull(v: unknown): number | null | undefined {
  if (typeof v === "number") return v;
  if (v === null) return null;
  return undefined;
}

export async function POST(request: NextRequest) {
  const expected = process.env.DASHBOARD_API_KEY;
  const auth = request.headers.get("authorization");
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const customerId = readString(body.customerId);
    const url = readString(body.url);
    const htmlTokens = readNumberOrNull(body.htmlTokens);
    const mdTokens = readNumberOrNull(body.mdTokens);
    const optimizedAtRaw = body.optimizedAt;

    if (!customerId || !url || htmlTokens === undefined || mdTokens === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: customerId, url, htmlTokens, mdTokens" },
        { status: 400 }
      );
    }

    const optimizedAt =
      typeof optimizedAtRaw === "string" || optimizedAtRaw instanceof Date
        ? new Date(optimizedAtRaw)
        : new Date();

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
        optimizedAt,
      },
      update: {
        htmlTokens,
        mdTokens,
        optimizedAt,
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

