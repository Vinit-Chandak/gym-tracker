import type { Route } from "next";
import type { ReactNode } from "react";

import { BackLink } from "@/components/shell/back-link";
import { InfoTip } from "@/components/ui/info-tip";
import type { SetupStep, SetupStepKey } from "@/lib/setup-path";

import { Steps } from "./steps";

/**
 * A step of setup (boards You, Where you train, What you have, Anything unusual, Your plan, How
 * you start): Back and the step dots on one bar, the step's question as the title, with an ⓘ
 * beside it when there is more to know, a line under it only when the step needs one, then the
 * step; its action, and a way past it, pinned at the foot. No tab bar: there is nothing to
 * navigate to yet.
 */
export function OnboardingFrame({
  steps,
  current,
  back,
  backLabel = "Back",
  title,
  sub,
  info,
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
  /** What someone may still want to know about the step, beside its title, never in it. */
  info?: { label: string; note: ReactNode };
  children: ReactNode;
}) {
  return (
    <div className="onboarding page-width">
      <header className="onboarding-head">
        {back ? <BackLink fallback={back} label={backLabel} /> : <span />}
        <Steps steps={steps} current={current} />
      </header>
      {title &&
        (info ? (
          <div className="flex items-center gap-1">
            <h1 className="onboarding-title">{title}</h1>
            <InfoTip label={info.label} className="mt-[calc(8*var(--ov-u))]">
              {info.note}
            </InfoTip>
          </div>
        ) : (
          <h1 className="onboarding-title">{title}</h1>
        ))}
      {sub && <p className="onboarding-sub">{sub}</p>}
      {children}
    </div>
  );
}
