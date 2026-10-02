import { LoadingPage } from "@/components/shell/loading-page";

export default function Loading() {
  // One cell standing in for the search field; the results arrive only once something is typed.
  return <LoadingPage title="Find people" segmented rows={0} />;
}
