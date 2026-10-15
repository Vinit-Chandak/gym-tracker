import { coachResourceMetadata } from "@/server/coach-connector-auth";

export function GET() {
  const metadata = coachResourceMetadata();
  return Response.json(metadata ?? { error: "The coach connector is not configured." }, {
    status: metadata ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
