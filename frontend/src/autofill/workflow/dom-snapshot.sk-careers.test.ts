import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectFieldsSnapshot } from "../dom/collect";

const FIXTURE = join(
  process.cwd(),
  "fixtures/dom-snapshots/sk-careers-application-form/sanitized.html",
);

beforeEach(() => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "https://www.skcareers.com/apply" });
});

afterEach(() => document.body.replaceChildren());

function load(mutate?: () => void) {
  document.body.innerHTML = readFileSync(FIXTURE, "utf8");
  mutate?.();
  const sections = collectFieldsSnapshot(document).request.sections;
  const fields = sections.flatMap((section) => section.fields);
  const tally = (values: string[]) =>
    values.reduce<Record<string, number>>((counts, value) => {
      counts[value] = (counts[value] ?? 0) + 1;
      return counts;
    }, {});
  return {
    perSection: sections.map((section) => section.fields.length),
    controls: tally(fields.map((field) => field.control)),
    visibility: tally(fields.map((field) => field.visibility)),
    labelled: fields.filter(
      (field) => (field.semanticContext?.labels?.length ?? 0) > 0,
    ).length,
  };
}

// Sanitized structure from a real SK careers application form with its
// conditional areas opened. Not evidence of live-site success rates.
describe("SK careers sanitized application form structure", () => {
  it("collects the form through the SK adapter with the page's hidden split", () => {
    expect(load()).toEqual({
      perSection: [28, 19, 1, 1, 0, 0],
      controls: { text: 33, radio: 3, select: 13 },
      visibility: { visible: 22, hidden: 27 },
      labelled: 28,
    });
  });

  it("depends on the synthetic hidden state for the visible/hidden split", () => {
    const result = load(() =>
      document
        .querySelectorAll("[hidden]")
        .forEach((element) => element.removeAttribute("hidden")),
    );
    expect(result.visibility.hidden).toBeUndefined();
  });

  it("depends on the preserved class tokens for the SK section layout", () => {
    const result = load(() =>
      document
        .querySelectorAll("[class]")
        .forEach((element) => element.removeAttribute("class")),
    );
    expect(result.perSection).not.toEqual([28, 19, 1, 1, 0, 0]);
  });
});
