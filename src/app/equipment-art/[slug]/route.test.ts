import { afterEach, expect, it, vi } from "vitest";

import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
});

const get = (file: string) =>
  GET(new Request(`http://localhost/equipment-art/${file}`), {
    params: Promise.resolve({ slug: file }),
  });

it("serves a draft drawing only where drafts are shown, cached for good", async () => {
  vi.stubEnv("OVERLOAD_SHOW_DRAFTS", "1");
  const response = await get("leg_press_45.svg");
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");
  expect(response.headers.get("Cache-Control")).toContain("immutable");
  expect(await response.text()).toMatch(/^<svg .*stroke="currentColor".*<\/svg>$/);
});

it("does not serve a draft anywhere else, nor anything that is not a drawing", async () => {
  vi.stubEnv("OVERLOAD_SHOW_DRAFTS", "");
  vi.stubEnv("NODE_ENV", "production");
  expect((await get("leg_press_45.svg")).status).toBe(404);
  vi.stubEnv("OVERLOAD_SHOW_DRAFTS", "1");
  expect((await get("leg_press_45")).status).toBe(404);
  expect((await get("rowing_boat.svg")).status).toBe(404);
});
