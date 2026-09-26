import { LoadingPage } from "@/components/shell/loading-page";

export default function Loading() {
  // History is a section of Progress: the same title, and the picker and filters reserved.
  return <LoadingPage title="Progress" controls />;
}
