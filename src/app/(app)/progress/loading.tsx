import { LoadingPage } from "@/components/shell/loading-page";

export default function Loading() {
  // The section picker and the filters beside it, reserved so the real screen does not
  // shove the content down when it arrives.
  return <LoadingPage title="Progress" controls />;
}
