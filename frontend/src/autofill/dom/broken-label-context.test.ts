import { afterEach, describe, expect, it } from "vitest";
import { collectFieldsSnapshotWithDropdowns } from "./collect";

afterEach(() => document.body.replaceChildren());

const select = (text: string) => `<select><option value="">${text}</option></select>`;
const label = '<label for="missing">기준 날짜</label>';
const labels = async (html: string) => {
  document.body.innerHTML = `<form>${html}</form>`;
  const snapshot = await collectFieldsSnapshotWithDropdowns(document);
  return snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]).map((field) => field.semanticContext?.labels?.filter(
    (entry) => entry.source === "label" && entry.text === "기준 날짜",
  ) ?? []);
};

describe("generic broken-label ownership", () => {
  it.each([2, 3])("recovers one broken label for %i consecutive selects", async (count) => {
    expect(await labels(
      `<div>${label}<div>${["년", "월", "일"].slice(0, count).map(select).join("")}</div></div>`,
    )).toEqual(Array.from({ length: count }, () => [
      { source: "label", text: "기준 날짜" },
    ]));
  });

  it.each([
    ["interleaved input", `<div>${label}${select("년")}<input>${select("일")}</div>`],
    ["two groups", `<div>${label}<div role="group">${select("년")}</div><div role="group">${select("일")}</div></div>`],
    ["two unmarked groups", `<div>${label}<div>${select("년")}</div><div>${select("일")}</div></div>`],
    ["repeat rows", `<div>${label}<div data-repeater-item>${select("년")}</div><div data-repeater-item>${select("일")}</div></div>`],
    ["four controls", `<div>${label}${select("년")}${select("월")}${select("일")}${select("시")}</div>`],
    ["two labels", `<div>${label}<label for="other-missing">다른 날짜</label>${select("년")}${select("일")}</div>`],
    ["hidden label", `<div><label for="missing" style="display:none">기준 날짜</label>${select("년")}${select("일")}</div>`],
    ["empty for", `<div><label for="">기준 날짜</label>${select("년")}${select("일")}</div>`],
    ["fieldset boundary", `<div>${label}<fieldset>${select("년")}${select("일")}</fieldset></div>`],
    ["section boundary", `<div>${label}<section>${select("년")}${select("일")}</section></div>`],
    ["deep label", `<div>${label}<div><div><div><div>${select("년")}${select("일")}</div></div></div></div></div>`],
  ])("does not borrow a label across %s", async (_name, html) => {
    const result = await labels(html);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((entries) => entries.length === 0)).toBe(true);
  });

  it("keeps single-control broken-label behavior", async () => {
    expect(await labels(`<div>${label}<span><input></span></div>`)).toEqual([
      [{ source: "label", text: "기준 날짜" }],
    ]);
  });
});
