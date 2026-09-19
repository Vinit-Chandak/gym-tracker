import type { Metadata } from "next";
import { ProgrammeDraftPage } from "@/components/coaching/draft-page";

export const metadata: Metadata = { title: "Programme draft" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ProgrammeDraftPage onboarding id={(await params).id} />;
}
