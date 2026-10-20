import { ProgrammeBuilderPage } from "@/components/coaching/builder-page";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string; mode?: string }>;
}) {
  const { draft, mode } = await searchParams;
  return <ProgrammeBuilderPage draftId={draft} mode={mode} />;
}
