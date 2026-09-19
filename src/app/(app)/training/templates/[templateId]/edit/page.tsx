import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PrescriptionEditor } from "@/components/activities/prescription-editor";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { fromMetres } from "@/lib/distance-units";
import { saveTemplateAction } from "@/server/actions/activity-templates";
import { requireUser } from "@/server/auth";
import { getTemplate } from "@/server/repositories/activity-templates";
import { requireUuid } from "@/server/validation/params";

export const metadata: Metadata = { title: "Edit template" };

/**
 * Editing writes the template's next revision (§5.1). Anything already scheduled keeps the
 * revision it copied, so this changes what you pick next, not what is on the calendar.
 */
export default async function EditTemplatePage(
  props: PageProps<"/training/templates/[templateId]/edit">,
) {
  const { templateId } = await props.params;
  requireUuid(templateId);
  const user = await requireUser();
  const template = await withUser(getDb(), user.id, (tx) => getTemplate(tx, user.id, templateId), {
    readOnly: true,
  });
  if (!template) notFound();

  const targets = template.prescription.sessionTargets;
  const unit = template.sport === "swimming" ? "m" : "km";
  const block = template.prescription.nodes.find((node) => node.kind === "repeat");
  const step = block?.kind === "repeat" ? block.steps[0] : undefined;

  return (
    <>
      <PageHeader title="Edit template" backHref="/training/templates" />
      <PageContent>
        <PrescriptionEditor
          action={saveTemplateAction.bind(null, templateId)}
          sport={template.sport}
          sports={[]}
          initial={{
            sport: template.sport,
            name: template.name,
            notes: template.notes ?? "",
            durationMinMinutes: targets.durationMs ? String(targets.durationMs[0] / 60_000) : "",
            durationMaxMinutes: targets.durationMs ? String(targets.durationMs[1] / 60_000) : "",
            distanceMin: targets.distanceMetres
              ? String(fromMetres(targets.distanceMetres[0], unit))
              : "",
            distanceMax: targets.distanceMetres
              ? String(fromMetres(targets.distanceMetres[1], unit))
              : "",
            distanceUnit: unit,
            effortMin: targets.effort ? String(targets.effort[0]) : "",
            effortMax: targets.effort ? String(targets.effort[1]) : "",
            repetitions: block?.kind === "repeat" ? String(block.repetitions) : "",
            restBetweenSeconds:
              block?.kind === "repeat" && block.restBetweenMs !== null
                ? String(block.restBetweenMs / 1000)
                : "",
            stepTargetKind: step ? step.target.kind : "none",
            stepDistance:
              step?.target.kind === "distance"
                ? String(fromMetres(step.target.metres[1], unit))
                : "",
            stepDurationSeconds:
              step?.target.kind === "duration" ? String(step.target.ms[1] / 1000) : "",
            stepDistanceUnit: unit,
          }}
          submitLabel="Save changes"
        />
      </PageContent>
    </>
  );
}
