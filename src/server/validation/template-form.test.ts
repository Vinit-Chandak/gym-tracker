import { describe, expect, it } from "vitest";

import { describePrescription } from "@/domain/activity-prescription";
import { DEFAULT_SPORT_UNITS } from "@/lib/distance-units";

import { prescriptionFromForm, templateProblems, templateSchema } from "./template-form";

/**
 * The template form as the athlete fills it in: what it stores, and where each refusal is
 * said. A refusal the prescription raised used to be filed under a name no box on the form
 * has, so the form came back with nothing said at all.
 */

const parse = (values: Record<string, string>) =>
  templateSchema.safeParse({ sport: "running", name: "Easy 5k", ...values });

/** The form's refusals, as the action would put them on the form. */
function refusals(values: Record<string, string>) {
  const form = parse(values);
  if (!form.success)
    return {
      fieldErrors: Object.fromEntries(
        form.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
      ),
      formError: undefined,
    };
  const prescription = prescriptionFromForm(form.data);
  if (prescription.ok) return null;
  return templateProblems(prescription.problems, form.data);
}

describe("where a refusal is said", () => {
  it("says on the form that a session needs a target", () => {
    expect(refusals({})).toEqual({
      fieldErrors: {},
      formError: "Give the session a target, or write out its steps",
    });
  });

  it("puts a range written high to low under its first box", () => {
    const said = refusals({ durationMinMinutes: "40", durationMaxMinutes: "30" });
    expect(said?.fieldErrors.durationMinMinutes).toMatch(/low to high/);
    expect(said?.formError).toBeUndefined();
    expect(refusals({ distanceMin: "6", distanceMax: "5" })?.fieldErrors.distanceMin).toMatch(
      /low to high/,
    );
  });

  it("says effort is out of five under the effort box", () => {
    const said = refusals({ durationMinMinutes: "30", effortMin: "6", effortMax: "7" });
    expect(said?.fieldErrors.effortMin).toMatch(/1 to 5/);
    expect(said?.fieldErrors.effortMax).toMatch(/1 to 5/);
  });

  it("says a block repeated once is not a block, under Repetitions", () => {
    const said = refusals({
      repetitions: "1",
      stepTargetKind: "distance",
      stepDistance: "400",
      stepDistanceUnit: "m",
    });
    expect(said?.fieldErrors.repetitions).toMatch(/2 to 100 times/);
  });

  it("puts a block's missing distance under the box for it", () => {
    const said = refusals({ repetitions: "8", stepTargetKind: "distance" });
    expect(Object.keys(said?.fieldErrors ?? {})).toEqual(["stepDistance"]);
    const timed = refusals({ repetitions: "8", stepTargetKind: "duration" });
    expect(Object.keys(timed?.fieldErrors ?? {})).toEqual(["stepDurationSeconds"]);
  });

  it("never drops a refusal no box is for", () => {
    const said = templateProblems(
      [
        { path: "nodes", message: "Keep a session under 100 written steps" },
        { path: "sessionTargets.effort.0", message: "Effort is out of 5" },
      ],
      parse({}).data!,
    );
    expect(said).toEqual({
      fieldErrors: { effortMin: "Effort is out of 5" },
      formError: "Keep a session under 100 written steps",
    });
  });
});

describe("what a template stores", () => {
  it("keeps the unit each distance was typed in, beside the metres", () => {
    const form = parse({
      distanceMin: "5",
      distanceMax: "5",
      distanceUnit: "mi",
      repetitions: "4",
      stepTargetKind: "distance",
      stepDistance: "0.25",
      stepDistanceUnit: "mi",
    });
    expect(form.success).toBe(true);
    const prescription = prescriptionFromForm(form.data!);
    expect(prescription.ok).toBe(true);
    if (!prescription.ok) return;
    expect(prescription.value.sessionTargets).toMatchObject({
      distanceMetres: [8046.72, 8046.72],
      distanceUnit: "mi",
    });
    const block = prescription.value.nodes[0];
    expect(block?.kind === "repeat" && block.steps[0]?.target).toEqual({
      kind: "distance",
      metres: [402.336, 402.336],
      unit: "mi",
    });
    expect(describePrescription(prescription.value, DEFAULT_SPORT_UNITS)).toBe("4 × 402 m");
  });

  it("stores a duration typed with a fraction as whole milliseconds", () => {
    const form = parse({ durationMinMinutes: "0.333333", durationMaxMinutes: "1" });
    const prescription = prescriptionFromForm(form.data!);
    expect(prescription.ok).toBe(true);
    if (!prescription.ok) return;
    expect(prescription.value.sessionTargets.durationMs).toEqual([20_000, 60_000]);
  });
});
