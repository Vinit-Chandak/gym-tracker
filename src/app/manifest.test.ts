import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import startupImages from "@/lib/startup-images.json";

import manifest from "./manifest";

const publicFile = (url: string) => new URL(`../../public${url}`, import.meta.url);

/** A PNG's width and height, from its header. */
function pngSize(url: string): string {
  const header = readFileSync(publicFile(url));
  return `${header.readUInt32BE(16)}x${header.readUInt32BE(20)}`;
}

describe("the manifest", () => {
  const app = manifest();

  it("leaves the screen's way up to the phone's rotation lock", () => {
    expect(app).not.toHaveProperty("orientation");
  });

  it("names images that exist at the sizes it gives", () => {
    const images = [
      ...app.icons!,
      ...app.shortcuts!.flatMap((shortcut) => shortcut.icons ?? []),
      ...app.screenshots!,
    ];
    for (const image of images) {
      expect(existsSync(publicFile(image.src)), image.src).toBe(true);
      expect(pngSize(image.src), image.src).toBe(image.sizes);
    }
  });

  it("offers a narrow and a wide screenshot, each labelled", () => {
    const shots = app.screenshots!;
    expect(new Set(shots.map((shot) => shot.form_factor))).toEqual(new Set(["narrow", "wide"]));
    for (const shot of shots) expect(shot.label).toBeTruthy();
  });

  it("opens each shortcut within the app", () => {
    for (const shortcut of app.shortcuts!) expect(shortcut.url.startsWith("/")).toBe(true);
  });
});

describe("iOS's launch images", () => {
  it("exist for every screen they are listed for, light and dark", () => {
    for (const image of startupImages)
      expect(existsSync(publicFile(image.url)), image.url).toBe(true);
    const dark = startupImages.filter((image) =>
      image.media.includes("(prefers-color-scheme: dark)"),
    );
    expect(dark.length * 2).toBe(startupImages.length);
  });

  it("are drawn at the screen's own pixels", () => {
    for (const { url, media } of startupImages) {
      const query = (pattern: RegExp) => Number(media.match(pattern)![1]);
      const [width, height] = [query(/device-width: (\d+)px/), query(/device-height: (\d+)px/)];
      const ratio = query(/pixel-ratio: (\d)/);
      const [w, h] = media.includes("landscape") ? [height, width] : [width, height];
      expect(pngSize(url), url).toBe(`${w * ratio}x${h * ratio}`);
    }
  });
});
