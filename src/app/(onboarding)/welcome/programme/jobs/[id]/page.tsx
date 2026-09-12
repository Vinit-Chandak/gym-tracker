import { ProgrammeJobPage } from "@/components/coaching/job-page";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ProgrammeJobPage onboarding id={(await params).id} />;
}
