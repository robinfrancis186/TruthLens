import { NextResponse } from "next/server";
import { getCachedResult } from "../../../../lib/server/result-cache";

export async function GET(_request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const result = getCachedResult(requestId);
  if (!result) {
    return NextResponse.json({ detail: "Result not found or expired." }, { status: 404 });
  }
  return NextResponse.json({ request_id: requestId, status: "completed", result });
}
