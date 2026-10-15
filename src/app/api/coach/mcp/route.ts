import { after } from "next/server";
import { getDb } from "@/db/client";
import { handleCoachMcp } from "@/server/coach-mcp";

export function POST(request: Request) {
  return handleCoachMcp(getDb(), request, { defer: after });
}
export function GET(request: Request) {
  return handleCoachMcp(getDb(), request);
}
