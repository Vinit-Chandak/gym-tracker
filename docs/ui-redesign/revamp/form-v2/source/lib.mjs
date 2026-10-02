// Small helpers for writing .dc.html artboards with inline styles.
import { hex as okhex, contrast } from "./color.mjs";

export const esc = (t) =>
  String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Style object -> inline style string. Numbers get px except for unitless keys.
const UNITLESS = new Set([
  "opacity",
  "font-weight",
  "line-height",
  "z-index",
  "flex-grow",
  "flex-shrink",
  "order",
  "flex",
]);
export function s(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => `${k}: ${typeof v === "number" && !UNITLESS.has(k) ? v + "px" : v}`)
    .join("; ");
}

// OKLCH helper returning hex, so every artboard carries plain sRGB that any engine paints the same.
export const ok = (L, C, h) => okhex(L, C, h);
export { contrast };

export function ratio(fg, bg) {
  return Math.round(contrast(fg, bg) * 100) / 100;
}

// The .dc.html page around an artboard body.
export function page({ title, fonts, css = "", body, w, h, props = null }) {
  const dataProps = props || { $preview: { width: w, height: h } };
  // Keep the template parser away from anything that looks like a {{hole}}.
  css = css.replace(/\}\}/g, "} }").replace(/\{\{/g, "{ {");
  body = body.replace(/\}\}/g, "} }").replace(/\{\{/g, "{ {");
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="${fonts}">
<style>
body{margin:0}
${css}
</style>
</helmet>
${body}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='${JSON.stringify(dataProps).replace(/'/g, "&#39;")}'>
class Component extends DCLogic {
  renderVals() {
    return {};
  }
}
</script>
</body>
</html>
`;
}

// SVG icon wrapper. paths: inner SVG markup using currentColor.
export function svg(
  inner,
  { size = 24, label = null, sw = 1.5, cap = "round", join = "round", style = "" } = {},
) {
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ${a11y} style="${s({ "stroke-width": sw, "stroke-linecap": cap, "stroke-linejoin": join, "flex-shrink": 0, display: "block" })}${style ? "; " + style : ""}">${inner}</svg>`;
}
