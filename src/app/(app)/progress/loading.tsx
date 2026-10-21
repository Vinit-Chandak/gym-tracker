import { LoadingPage } from "@/components/shell/loading-page";

export default function Loading() {
  // The section picker is the headline (DESIGN.md, Tab roots): its place is reserved there, so
  // the real screen does not shove the content down when it arrives.
  return <LoadingPage tab="Progress" />;
}
