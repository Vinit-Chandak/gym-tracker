import type { Route } from "next";
import type { ReactNode } from "react";

import { BackLink } from "@/components/shell/back-link";
import type { SetupStep, SetupStepKey } from "@/lib/setup-path";

import { Steps } from "./steps";

/**
 * A step of setup (boards You, Where you train, What you have, Anything unusual, Your plan, How
 * you start): Back and the step dots on one bar, the step's question as the title, a line under
 * it when it needs one, then the step; its action, and a way past it, pinned at the foot. No tab
 * bar: there is nothing to navigate to yet.
 */
export function OnboardingFrame({
  steps,
  current,
  back,
  backLabel = "Back",
  title,
  sub,
  children,
}: {
  /** The athlete's own path through setup (`setupSteps`). */
  steps: readonly SetupStep[];
  current: SetupStepKey;
  /** The step before, for Back without a page before it; the first step has none. */
  back?: Route;
  backLabel?: string;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="onboarding page-width">
      <header className="onboarding-head">
        {back ? <BackLink fallback={back} label={backLabel} /> : <span />}
        <Steps steps={steps} current={current} />
      </header>
      {title && <h1 className="onboarding-title">{title}</h1>}
      {sub && <p className="onboarding-sub">{sub}</p>}
      {children}
    </div>
  );
}
