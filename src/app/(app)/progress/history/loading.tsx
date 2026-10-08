import { LoadingPage } from "@/components/shell/loading-page";

export default function Loading() {
  // A page under Progress's Overview, as the calendar is, under its own name (ADR 0045).
  return <LoadingPage title="History" />;
}
