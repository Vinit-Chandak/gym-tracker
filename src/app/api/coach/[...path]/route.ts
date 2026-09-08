import { getDb } from "@/db/client";
import { handleCoachRequest } from "@/server/coach-api";

export async function GET(request: Request, context: RouteContext<"/api/coach/[...path]">) {
  const { path } = await context.params;
  return handleCoachRequest(getDb(), request, path);
}
