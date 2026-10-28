// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { StatTile, StatTileRow } from "./stat-tile";

afterEach(cleanup);

it("sets a stat's digits as figures and leaves its words as words", () => {
  const { container } = render(
    <StatTileRow>
      <StatTile label="Weeks" value={12} />
      <StatTile label="Load jump" value="2.5 kg" />
      <StatTile label="Load jump" value="Machine" />
    </StatTileRow>,
  );
  const values = [...container.querySelectorAll("dd")];
  expect(values.map((value) => value.textContent)).toEqual(["12", "2.5 kg", "Machine"]);
  expect(values.map((value) => value.querySelector(".figures")?.textContent ?? null)).toEqual([
    "12",
    "2.5",
    null,
  ]);
});
