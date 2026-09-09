import { LoadingPage } from "@/components/shell/loading-page";

export default function Loading() {
  // Overview, Strength, Running, Recovery and Body: the strip is reserved so the real
  // screen does not shove the content down when it arrives.
  return <LoadingPage title="Progress" tabs={5} />;
}
