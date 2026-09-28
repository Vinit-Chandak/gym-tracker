import { after } from "next/server";
import { getDb } from "@/db/client";
import { handleCoachServiceRequest } from "@/server/coach-service";

/** The house coach's endpoints. More specific than `/api/coach/[...path]`, so it wins the route. */
export async function GET(request: Request, context: RouteContext<"/api/coach/service/[...path]">) {
  const { path } = await context.params;
  return handleCoachServiceRequest(getDb(), request, path, { defer: after });
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/coach/service/[...path]">,
) {
  const { path } = await context.params;
  // A review's re-plan is started once the worker has its answer, not before it.
  return handleCoachServiceRequest(getDb(), request, path, { defer: after });
}
