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
//
// Three more sets come from the same source:
// - the monochrome icon, the glyph alone at the maskable size, for Android's themed icons;
// - the manifest's shortcut icons, the tab bar's glyphs on the icon's ground;
// - iOS's launch images (public/splash), which iOS shows while the installed app opens. iOS draws
//   no launch screen from the manifest, only from an image made for the exact screen, so there is
//   one per screen size, orientation and scheme, and src/lib/startup-images.json lists them for
//   layout.tsx. A screen with no image of its own opens on a blank screen, as before; add its
//   size to SCREENS below when a new iPhone or iPad ships, and run this again.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "src/app/icon.svg"), "utf8");

/** How much of the maskable canvas Android's launcher shows: 72 of 108 dp. */
const MASKABLE_VISIBLE = 72 / 108;

const glyph = source.match(/<g[\s\S]*<\/g>/)?.[0];
const background = source.match(/<rect[^>]*fill="([^"]+)"/)?.[1];
const ink = glyph?.match(/fill="([^"]+)"/)?.[1];
if (!glyph || !background || !ink) throw new Error("icon.svg is not shaped as expected");
const inner = source.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${background}"/>
  <g transform="translate(256 256) scale(${MASKABLE_VISIBLE}) translate(-256 -256)">${glyph}</g>
</svg>`;

// Only the shape counts in a monochrome icon; the launcher paints it in the wallpaper's colour.
const monochrome = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <g transform="translate(256 256) scale(${MASKABLE_VISIBLE}) translate(-256 -256)">${glyph.replace(/fill="[^"]+"/, 'fill="#ffffff"')}</g>
</svg>`;

const render = (svg, size, file, flatten = true) => {
  const image = sharp(Buffer.from(svg), { density: 384 }).resize(size, size);
  return (flatten ? image.flatten({ background }) : image)
    .png({ compressionLevel: 9, palette: true })
    .toFile(join(root, file))
    .then(() => console.log(`${file} (${size}×${size})`));
};

/*
 * Shortcut icons: the destinations' glyphs from the tab bar (src/components/ui/glyphs.tsx,
 * filled as where you are) and Distance for a run, in the icon's colours, inside the two-thirds
 * a launcher's round mask keeps.
 */
const SHORTCUTS = {
  // Today is the app's mark in its pigments, as the lit tab draws it (DESIGN.md, Shapes).
  today: `<rect x="4" y="7" width="6" height="10" rx="1" fill="#2b40c8" stroke="#2b40c8"/><circle cx="16.5" cy="12.5" r="3.5" fill="#e5432a" stroke="#e5432a"/><path d="M3 20h18"/>`,
  food: `<path d="M2.5 10.5h19a9.5 9 0 0 1-19 0z" fill="${ink}"/><path d="M7 10.5a5 4.6 0 0 1 10 0" fill="${ink}"/>`,
  run: `<path d="M4.5 18.5c3.5 0 3.5-5.5 7-5.5s3.5-5.5 7-5.5"/><circle cx="4.5" cy="18.5" r="1.6" fill="${ink}" stroke="none"/><circle cx="18.5" cy="7.5" r="1.6" fill="${ink}" stroke="none"/>`,
  // Progress is the loaded bar: a barbell side on, its three plates growing.
  progress: `<path d="M2 12h20"/><rect x="5" y="9" width="2.6" height="6" rx="1" fill="${ink}"/><rect x="9.7" y="6.5" width="2.6" height="11" rx="1" fill="${ink}"/><rect x="14.4" y="4" width="2.6" height="16" rx="1" fill="${ink}"/>`,
};
const shortcut = (shapes) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" fill="${background}"/>
  <g transform="translate(16 16) scale(${64 / 24})" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shapes}</g>
</svg>`;

/*
 * The screens iOS 26 and iPadOS 26 run on, in points, portrait, with their pixel ratio. iPhones
 * open the app upright; iPads open it either way up, so they get both.
 */
const SCREENS = [
  { width: 440, height: 956, ratio: 3, both: false }, // iPhone 16 Pro Max, 17 Pro Max
  { width: 430, height: 932, ratio: 3, both: false }, // iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  { width: 428, height: 926, ratio: 3, both: false }, // iPhone 12 Pro Max, 13 Pro Max, 14 Plus
  { width: 420, height: 912, ratio: 3, both: false }, // iPhone Air
  { width: 414, height: 896, ratio: 3, both: false }, // iPhone 11 Pro Max
  { width: 414, height: 896, ratio: 2, both: false }, // iPhone 11
  { width: 402, height: 874, ratio: 3, both: false }, // iPhone 16 Pro, 17, 17 Pro
  { width: 393, height: 852, ratio: 3, both: false }, // iPhone 14 Pro, 15, 15 Pro, 16
  { width: 390, height: 844, ratio: 3, both: false }, // iPhone 12, 12 Pro, 13, 13 Pro, 14, 16e
  { width: 375, height: 812, ratio: 3, both: false }, // iPhone 11 Pro, 12 mini, 13 mini
  { width: 375, height: 667, ratio: 2, both: false }, // iPhone SE (2nd and 3rd generation)
  { width: 1032, height: 1376, ratio: 2, both: true }, // iPad Pro 13-inch (M4, M5)
  { width: 1024, height: 1366, ratio: 2, both: true }, // iPad Pro 12.9-inch, iPad Air 13-inch
  { width: 834, height: 1210, ratio: 2, both: true }, // iPad Pro 11-inch (M4, M5)
  { width: 834, height: 1194, ratio: 2, both: true }, // iPad Pro 11-inch (1st to 4th generation)
  { width: 820, height: 1180, ratio: 2, both: true }, // iPad Air 10.9- and 11-inch, iPad (10th generation, A16)
  { width: 834, height: 1112, ratio: 2, both: true }, // iPad Air (3rd generation)
  { width: 810, height: 1080, ratio: 2, both: true }, // iPad (8th and 9th generation)
  { width: 744, height: 1133, ratio: 2, both: true }, // iPad mini (6th generation, A17 Pro)
  { width: 768, height: 1024, ratio: 2, both: true }, // iPad mini (5th generation)
];

/** Form v2's two grounds (src/lib/appearance.ts), so the launch hands over to the first paint. */
const SCHEMES = { light: "#ffffff", dark: "#111214" };

/** The icon in the middle of the screen at 120 pt, as large as a launcher's icon is drawn. */
const SPLASH_ICON = 120;

const splash = (width, height, ratio, ground) => {
  const [w, h, icon] = [width * ratio, height * ratio, SPLASH_ICON * ratio];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${ground}"/>
  <svg x="${(w - icon) / 2}" y="${(h - icon) / 2}" width="${icon}" height="${icon}" viewBox="0 0 512 512">${inner}</svg>
</svg>`;
};

const startupImages = [];
const splashes = [];
rmSync(join(root, "public/splash"), { recursive: true, force: true });
mkdirSync(join(root, "public/splash"), { recursive: true });
for (const { width, height, ratio, both } of SCREENS) {
  for (const orientation of both ? ["portrait", "landscape"] : ["portrait"]) {
    const [w, h] = orientation === "portrait" ? [width, height] : [height, width];
    for (const [scheme, ground] of Object.entries(SCHEMES)) {
      const file = `public/splash/${w}x${h}@${ratio}x-${scheme}.png`;
      startupImages.push({
        url: file.replace(/^public/, ""),
        // iOS gives device-width and device-height upright, whichever way the screen is held.
        media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: ${orientation}) and (prefers-color-scheme: ${scheme})`,
      });
      splashes.push(
        sharp(Buffer.from(splash(w, h, ratio, ground)))
          .png({ compressionLevel: 9, palette: true })
          .toFile(join(root, file))
          .then(() => console.log(`${file} (${w * ratio}×${h * ratio})`)),
      );
    }
  }
}

await Promise.all([
  render(source, 192, "public/icons/icon-192.png"),
  render(source, 512, "public/icons/icon-512.png"),
  render(maskable, 512, "public/icons/icon-512-maskable.png"),
  render(monochrome, 512, "public/icons/icon-512-monochrome.png", false),
  ...Object.entries(SHORTCUTS).map(([name, shapes]) =>
    render(shortcut(shapes), 96, `public/icons/shortcut-${name}.png`),
  ),
  render(source, 180, "src/app/apple-icon.png"),
  ...splashes,
]);
writeFileSync(
  join(root, "src/lib/startup-images.json"),
  `${JSON.stringify(startupImages, null, 2)}\n`,
);
console.log(`src/lib/startup-images.json (${startupImages.length} launch images)`);
