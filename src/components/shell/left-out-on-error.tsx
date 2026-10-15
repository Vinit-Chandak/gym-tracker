"use client";

import { catchError } from "next/error";

/**
 * Holds a part of the shell that no page depends on, such as the active workout's strip: when
 * it fails, it is left out and the page beside it stays. Without this its error rose past the
 * app's own error screen — which sits inside the layout it is part of — to Next's bare page,
 * in place of a screen that had rendered. `catchError` lets Next's own signals through, so a
 * redirect from inside it (a session that ended) still leads where it should.
 */
export const LeftOutOnError = catchError(() => null);
