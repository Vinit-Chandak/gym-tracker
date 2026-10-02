/*
 * The App Router runs on React's canary channel, which is where <ViewTransition> and
 * addTransitionType live; the stable typings do not declare them. This reference makes the
 * canary declarations visible to the whole project without changing the installed React.
 */
/// <reference types="react/canary" />
