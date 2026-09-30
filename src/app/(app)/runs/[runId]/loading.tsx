import { LoadingPage } from "@/components/shell/loading-page";

/** An old run link opens the run's own record, which leads with its figure in a hero. */
export default function Loading() {
  return <LoadingPage title="Run" hero rows={2} />;
}
