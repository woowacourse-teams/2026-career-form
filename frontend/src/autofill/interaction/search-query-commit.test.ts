import { afterEach, expect, it } from "vitest";
import { SearchSurface } from "./search-surface";
import { observeQueryCommit } from "./search-query-commit";

function setup() {
  document.body.innerHTML = `<button id="open" type="button">검색</button><input id="target" readonly><section id="layer"><div id="query-group"><input id="query"></div><ul></ul></section>`;
  const layer = document.querySelector<HTMLElement>("#layer")!;
  const query = document.querySelector<HTMLInputElement>("#query")!;
  const group = query.parentElement!;
  const surface = new SearchSurface(
    "same-document-layer",
    layer,
    layer,
    document.querySelector<HTMLElement>("#open")!,
    document.querySelector<HTMLInputElement>("#target")!,
  );
  return {
    group,
    query,
    committed: observeQueryCommit(surface, query, "SAMPLE"),
  };
}
const chip = `<div><span>SAMPLE <button type="reset"></button></span></div>`;
afterEach(() => document.body.replaceChildren());

it("recognizes the original query being replaced by its exact query chip and reset action", () => {
  const { group, committed } = setup();
  expect(committed()).toBe(false);
  group.innerHTML = chip;
  expect(committed()).toBe(true);
});

it.each([
  chip.replace("SAMPLE", "OTHER"),
  `<span>SAMPLE</span>`,
  `<span>SAMPLE</span><button type="reset"></button>`,
  chip.replace('type="reset"', 'type="button"'),
  chip + `<button type="reset"></button>`,
  chip + `<input>`,
  chip.replace('type="reset"', 'type="reset" disabled'),
])("rejects an incomplete or ambiguous query commitment: %s", (markup) => {
  const { group, committed } = setup();
  group.innerHTML = markup;
  expect(committed()).toBe(false);
});

it("does not accept a matching chip outside the original query group", () => {
  const { group, committed } = setup();
  group.replaceChildren();
  group.insertAdjacentHTML("afterend", chip);
  expect(committed()).toBe(false);
});

it("does not accept a chip while the original query still exists", () => {
  const { group, committed } = setup();
  group.insertAdjacentHTML("beforeend", chip);
  expect(committed()).toBe(false);
});
