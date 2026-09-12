import { ProgrammeBuilderPage } from "@/components/coaching/builder-page";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  return <ProgrammeBuilderPage onboarding draftId={(await searchParams).draft} />;
}
