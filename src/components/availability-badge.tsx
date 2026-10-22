import { Badge } from "@/components/ui/badge";
import type { AvailabilityStatus } from "@/domain/equipment-resolution";
import { AVAILABILITY_LABELS } from "@/lib/labels";

export function AvailabilityBadge({ status }: { status: AvailabilityStatus }) {
  return <Badge>{AVAILABILITY_LABELS[status]}</Badge>;
}
