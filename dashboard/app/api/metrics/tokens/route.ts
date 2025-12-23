import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const expected = process.env.DASHBOARD_API_KEY;
  const auth = request.headers.get("authorization");
  if (!expected || auth !== `Bearer ${expected}`) {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/574fd32f-9942-40f1-96d6-0e10426324d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H2',location:'dashboard/app/api/metrics/tokens/route.ts:auth',message:'metrics endpoint unauthorized',data:{hasExpected:!!expected,authHeaderPresent:!!auth},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log
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

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/574fd32f-9942-40f1-96d6-0e10426324d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H2',location:'dashboard/app/api/metrics/tokens/route.ts:body',message:'metrics endpoint body received',data:{customerId,url,htmlTokens,mdTokens,optimizedAtPresent:!!optimizedAt},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log

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

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/574fd32f-9942-40f1-96d6-0e10426324d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H2',location:'dashboard/app/api/metrics/tokens/route.ts:upsert',message:'metrics upsert OK',data:{customerId,url},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving token metrics:", error);
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/574fd32f-9942-40f1-96d6-0e10426324d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H2',location:'dashboard/app/api/metrics/tokens/route.ts:exception',message:'metrics endpoint exception',data:{error:String(error)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

