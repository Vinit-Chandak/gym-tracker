// Renders the app's raster icons from the one vector source, src/app/icon.svg.
//
//   node scripts/render-icons.mjs
//
// Two shapes come out of it. The plain icons (public/icons/icon-*.png, src/app/apple-icon.png)
// are the SVG as drawn: iOS rounds the corners itself and shows the whole square, so the glyph
// sits at its designed size. The maskable icon is different: Android puts it on the adaptive
// icon's full 108 dp canvas and the launcher shows only the inner 72 dp (two-thirds), so an
// unpadded copy comes out a third larger than on iPhone — which is what happened before this
// script existed. Scaling the glyph to two-thirds on the same background makes the installed
// icon read the same on both platforms. Sharp ships with Next, so nothing needs installing.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "src/app/icon.svg"), "utf8");

/** How much of the maskable canvas Android's launcher shows: 72 of 108 dp. */
const MASKABLE_VISIBLE = 72 / 108;

const glyph = source.match(/<g[\s\S]*<\/g>/)?.[0];
const background = source.match(/<rect[^>]*fill="([^"]+)"/)?.[1];
if (!glyph || !background) throw new Error("icon.svg is not shaped as expected");

const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${background}"/>
  <g transform="translate(256 256) scale(${MASKABLE_VISIBLE}) translate(-256 -256)">${glyph}</g>
</svg>`;

const render = (svg, size, file) =>
  sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size)
    .flatten({ background })
    .png({ compressionLevel: 9, palette: true })
    .toFile(join(root, file))
    .then(() => console.log(`${file} (${size}×${size})`));

await Promise.all([
  render(source, 192, "public/icons/icon-192.png"),
  render(source, 512, "public/icons/icon-512.png"),
  render(maskable, 512, "public/icons/icon-512-maskable.png"),
  render(source, 180, "src/app/apple-icon.png"),
]);
