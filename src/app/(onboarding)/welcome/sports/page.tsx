import { redirect } from "next/navigation";

/**
 * What you train is asked on setup's first step now, beside which sounds like you (board You);
 * this address is kept for anyone holding a link to the step it used to be.
 */
export default function SportsStepPage() {
  redirect("/welcome");
}
