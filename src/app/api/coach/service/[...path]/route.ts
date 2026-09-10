import { getDb } from "@/db/client";
import { handleCoachServiceRequest } from "@/server/coach-service";

/** The house coach's endpoints. More specific than `/api/coach/[...path]`, so it wins the route. */
export async function GET(request: Request, context: RouteContext<"/api/coach/service/[...path]">) {
  const { path } = await context.params;
  return handleCoachServiceRequest(getDb(), request, path);
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/coach/service/[...path]">,
) {
  const { path } = await context.params;
  return handleCoachServiceRequest(getDb(), request, path);
}
