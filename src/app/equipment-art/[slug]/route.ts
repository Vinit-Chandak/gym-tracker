import { EQUIPMENT_DRAWINGS } from "@/components/equipment-art/drawings.generated";
import { drawingVisible } from "@/server/queries/equipment-art";

/**
 * One equipment drawing, as an SVG a screen lays over `currentColor` with a CSS mask, so it takes
 * the ink of wherever it stands: light, dark, a chosen tile, forced colours (DESIGN.md,
 * Illustrations). Its address carries its fingerprint, so a copy can be kept for good. A draft
 * is served only where drafts are shown; anywhere else it is not found.
 */
export async function GET(_request: Request, context: RouteContext<"/equipment-art/[slug]">) {
  const { slug: file } = await context.params;
  const slug = file.replace(/\.svg$/, "");
  const drawing = EQUIPMENT_DRAWINGS[slug];
  if (!file.endsWith(".svg") || !drawing || !drawingVisible(slug))
    return new Response("Not found", { status: 404 });
  return new Response(drawing.svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
