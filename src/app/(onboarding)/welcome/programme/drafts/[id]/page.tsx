import { ProgrammeDraftPage } from "@/components/coaching/draft-page";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ProgrammeDraftPage onboarding id={(await params).id} />;
}
