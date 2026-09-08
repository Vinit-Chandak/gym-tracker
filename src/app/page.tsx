import { redirect } from "next/navigation";

// The app has no landing page: "/" is simply the Today tab.
export default function RootPage() {
  redirect("/today");
}
