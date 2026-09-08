import { Badge } from "@/components/ui/badge";
import type { AvailabilityStatus } from "@/domain/equipment-resolution";
import { AVAILABILITY_LABELS } from "@/lib/labels";

const TONES: Record<AvailabilityStatus, "success" | "accent" | "neutral" | "danger"> = {
  direct: "success",
  fallback: "accent",
  unknown: "neutral",
  unavailable: "danger",
};

export function AvailabilityBadge({ status }: { status: AvailabilityStatus }) {
  return <Badge tone={TONES[status]}>{AVAILABILITY_LABELS[status]}</Badge>;
}
