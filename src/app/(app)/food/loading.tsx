import { LoadingPage } from "@/components/shell/loading-page";

/** Food while it loads: its headline's place (DESIGN.md, Tab roots), then the rows. */
export default function Loading() {
  return <LoadingPage tab="Food" rows={3} />;
}
