import { EQUIPMENT_ART } from "@/components/equipment-art/catalogue";
import { EQUIPMENT_DRAWINGS } from "@/components/equipment-art/drawings.generated";
import { showsDrafts } from "@/lib/drafts";

/**
 * Whether a drawing may be shown here: an approved one everywhere, a draft only where drafts are
 * switched on (plan: owner decisions, illustrations). Elsewhere a tile shows its name and
 * purpose without a picture, never a placeholder.
 */
export function drawingVisible(slug: string): boolean {
  const entry = EQUIPMENT_ART[slug];
  if (!entry || !EQUIPMENT_DRAWINGS[slug]) return false;
  return entry.status === "approved" || showsDrafts();
}

/** The address a drawing is served at, its fingerprint making it safe to cache for good. */
export function drawingUrl(slug: string): string {
  return `/equipment-art/${slug}.svg?v=${EQUIPMENT_DRAWINGS[slug]?.version ?? "0"}`;
}

/**
 * The drawings a screen may show, by slug, for the slugs it lists: a few dozen short addresses,
 * where the drawings themselves would be kilobytes each in every render.
 */
export function drawingUrls(slugs: Iterable<string>): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const slug of slugs) if (drawingVisible(slug)) urls[slug] = drawingUrl(slug);
  return urls;
}
