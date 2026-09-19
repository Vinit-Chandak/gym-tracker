import type { Metadata } from "next";
import { ProgrammeDraftPage } from "@/components/coaching/draft-page";

// One title for both of this route's views — a first programme to read, and a change to
// decide on — because telling them apart would cost a database round trip for a tab label.
export const metadata: Metadata = { title: "Programme draft" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ProgrammeDraftPage id={(await params).id} />;
}
