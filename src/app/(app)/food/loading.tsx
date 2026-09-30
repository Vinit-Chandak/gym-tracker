import { LoadingPage } from "@/components/shell/loading-page";

/** The Food screen opens with the day's sunflower card, then its seven meals. */
export default function Loading() {
  return <LoadingPage title="Food" hero rows={7} />;
}
