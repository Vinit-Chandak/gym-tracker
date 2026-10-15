"use client";

import { RouteError } from "@/components/shell/error-screen";

/**
 * The app's error screen for what `(app)/error.tsx` cannot catch: that boundary sits inside the
 * tabs' layout, so a failure in the layout itself — the account check every screen passes
 * through — and anything on the sign-in screens rose past it to Next's bare page, unthemed and
 * with no way back in an installed app.
 */
export default RouteError;
