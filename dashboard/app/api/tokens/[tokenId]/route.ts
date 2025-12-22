import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revokeApiToken } from "@/lib/tokens";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { tokenId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const customer = await prisma.customer.findUnique({
      where: { clerkUserId: userId },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    await revokeApiToken(customer.id, params.tokenId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error revoking token:", error);
    const message = error instanceof Error ? error.message : "Failed to revoke token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

