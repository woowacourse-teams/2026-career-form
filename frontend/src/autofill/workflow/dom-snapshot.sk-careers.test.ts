import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collectFieldsSnapshot,
  collectFieldsSnapshotWithDropdowns,
} from "../dom/collect";
import { usePolicyFixture } from "../../test/fixtures/execution-policy";
import { installExecutionPolicy } from "./execution-policy";

usePolicyFixture("sk");

const FIXTURE = join(
  process.cwd(),
  "fixtures/dom-snapshots/sk-careers-application-form/sanitized.html",
);
const TIMEOUT_MS = 30_000;

beforeEach(() => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://www.skcareers.com/Application/Index/R262165",
  });
});

afterEach(() => document.body.replaceChildren());

function load(mutate?: () => void) {
  document.body.innerHTML = readFileSync(FIXTURE, "utf8");
  mutate?.();
  const sections = collectFieldsSnapshot(document).request.sections;
  const fields = sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
  const tally = (values: string[]) =>
    values.reduce<Record<string, number>>((counts, value) => {
      counts[value] = (counts[value] ?? 0) + 1;
      return counts;
    }, {});
  return {
    sections: sections.map((section) => ({
      name: section.displayName ?? null,
      fields: section.fields.length,
      items: (section.items ?? []).map((item) => item.fields.length),
    })),
    controls: tally(fields.map((field) => field.control)),
    visibility: tally(fields.map((field) => field.visibility)),
    labelled: fields.filter(
      (field) => (field.semanticContext?.labels?.length ?? 0) > 0,
    ).length,
    repeated: fields.filter((field) => field.semanticContext?.repeat).length,
  };
}

// Sanitized structure from a real SK careers application form with one row of
// each repeatable section added. Not evidence of live-site success rates.
describe("SK careers sanitized application form structure", () => {
  it("keeps policy collection requests unchanged when generic label recovery is requested", async () => {
    load();
    const withoutSnapshotId = (snapshot: ReturnType<typeof collectFieldsSnapshot>) => {
      const { snapshotId: _snapshotId, ...request } = snapshot.request;
      return request;
    };
    const baseline = withoutSnapshotId(collectFieldsSnapshot(document));
    expect(withoutSnapshotId(collectFieldsSnapshot(
      document,
      new Map(),
      { recoverBrokenLabels: true },
    ))).toEqual(baseline);
    expect(withoutSnapshotId(await collectFieldsSnapshotWithDropdowns(document)))
      .toEqual(baseline);
  }, TIMEOUT_MS);

  it("collects the same structural radio question without a company policy or names", () => {
    installExecutionPolicy(document);
    document.body.innerHTML = readFileSync(FIXTURE, "utf8");
    const radios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="prsVeteranBenefitYN"]'));
    radios.forEach((radio) => radio.removeAttribute("name"));
    const question = radios[0]!.closest(".btn-selector-container")!;
    question.querySelector(".form-label")!.insertAdjacentHTML("beforeend", "<p>국가유공자 해당 여부</p>");
    const fields = collectFieldsSnapshot(document).request.sections.flatMap((section) => [
      ...section.fields, ...(section.items ?? []).flatMap((item) => item.fields),
    ]);
    const group = fields.find((field) => field.displayName === "보훈 정보");
    expect(group?.options?.map((option) => option.displayName)).toEqual(["비대상", "대상"]);
    expect(group?.semanticContext?.labels).toContainEqual({
      source: "description", text: "국가유공자 해당 여부",
    });
    expect(group?.semanticContext?.labels).not.toContainEqual({
      source: "label", text: "병역 정보",
    });
  }, TIMEOUT_MS);

  it(
    "collects sections and repeat rows through the SK adapter with the page's hidden split",
    () => {
      expect(load()).toEqual({
        sections: [
          { name: "인적 사항", fields: 28, items: [] },
          { name: "지원 정보", fields: 19, items: [] },
          { name: "학력", fields: 1, items: [9, 17, 19] },
          { name: "경력", fields: 0, items: [10] },
          { name: "경험/특허", fields: 0, items: [5, 3] },
          { name: "수상", fields: 0, items: [4] },
          { name: "자격/면허", fields: 0, items: [4] },
          { name: "어학", fields: 0, items: [6] },
          { name: "외국어 능력", fields: 0, items: [4] },
          { name: "자기소개서", fields: 1, items: [1, 1] },
          { name: "추가자료", fields: 0, items: [1] },
          { name: null, fields: 0, items: [1] },
        ],
        controls: { text: 86, radio: 8, select: 34, textarea: 5, checkbox: 1 },
        visibility: { visible: 98, hidden: 36 },
        labelled: 94,
        repeated: 85,
      });
    },
    TIMEOUT_MS,
  );

  it(
    "depends on the synthetic hidden state for the visible/hidden split",
    () => {
      const result = load(() =>
        document
          .querySelectorAll("[hidden]")
          .forEach((element) => element.removeAttribute("hidden")),
      );
      expect(result.visibility).toEqual({ visible: 134 });
    },
    TIMEOUT_MS,
  );

  it(
    "depends on the preserved class tokens for the SK sections and repeat rows",
    () => {
      const result = load(() =>
        document
          .querySelectorAll("[class]")
          .forEach((element) => element.removeAttribute("class")),
      );
      expect(result.sections).toEqual([{ name: null, fields: 134, items: [] }]);
    },
    TIMEOUT_MS,
  );
});
