import type { Metadata } from "next";

import { ErrorPreview } from "./error-preview";

export const metadata: Metadata = { title: "Preview · Error" };

/**
 * The error screen (board Offline), as a workout meets it offline. `?state=online` is a server
 * error with the connection up; `?state=elsewhere` is offline outside a workout.
 */
export default async function ErrorPreviewPage(props: PageProps<"/preview/error">) {
  const { state } = await props.searchParams;
  return <ErrorPreview online={state === "online"} inWorkout={state !== "elsewhere"} />;
}
