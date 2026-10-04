import type { Route } from "next";
import type { ReactNode } from "react";

import { BackLink } from "@/components/shell/back-link";

import { Steps, type OnboardingStep } from "./steps";

/**
 * A step of the first run (boards Welcome, Sports, Gym, Machines, Plan): Back and the step dots
 * on one bar, the step's question as the title, a line under it when it needs one, then the
 * step; its action, and a way past it, pinned at the foot. No tab bar: there is nothing to
 * navigate to yet.
 */
export function OnboardingFrame({
  step,
  back,
  title,
  sub,
  children,
}: {
  step: OnboardingStep;
  /** The step before, for Back without a page before it; the first step has none. */
  back?: Route;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="onboarding page-width">
      <header className="onboarding-head">
        {back ? <BackLink fallback={back} label="Back" /> : <span />}
        <Steps current={step} />
      </header>
      {title && <h1 className="onboarding-title">{title}</h1>}
      {sub && <p className="onboarding-sub">{sub}</p>}
      {children}
    </div>
  );
}
