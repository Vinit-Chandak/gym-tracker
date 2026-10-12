import { LoadingPage } from "@/components/shell/loading-page";

import { WorkoutLoadingFrame } from "./loading-frame";

export default function Loading() {
  return (
    <WorkoutLoadingFrame>
      <LoadingPage title="Session" />
    </WorkoutLoadingFrame>
  );
}
