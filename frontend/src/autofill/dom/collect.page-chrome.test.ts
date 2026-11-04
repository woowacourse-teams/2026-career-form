import { fixturePolicy } from "../../test/fixtures/execution-policy";
import { installExecutionPolicy } from "../workflow/execution-policy";
import { describe, expect, it } from "vitest";

import { collectFieldsSnapshot } from "./collect";

function setPageUrl(url: string): void {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
  installExecutionPolicy(
    document,
    new URL(url).hostname === "talent.hyundai.com"
      ? fixturePolicy("hyundai")
      : undefined,
  );
}

function collectedDomIds(): Array<string | undefined> {
  return collectFieldsSnapshot(document).request.sections.flatMap((section) =>
    section.fields.map(({ domId }) => domId),
  );
}

const CHROME_SELECT = `
  <div><div><div>
    <address>(주) 예시회사 | 대표이사 홍길동</address>
    <select id="chrome">
      <option>가</option><option>나</option><option>다</option>
      <option>라</option><option>마</option>
    </select>
  </div></div></div>`;

describe("generic collection skips page chrome controls", () => {
  it("skips a page-level footer select outside a form but keeps ordinary fields", () => {
    setPageUrl("https://careers.example.test/apply");
    document.body.innerHTML = `
      <label>이름<input id="name" /></label>
      <footer>${CHROME_SELECT}</footer>`;

    expect(collectedDomIds()).toEqual(["name"]);
  });

  it("skips a control inside a role=contentinfo landmark", () => {
    setPageUrl("https://careers.example.test/apply");
    document.body.innerHTML = `
      <label>이름<input id="name" /></label>
      <div role="contentinfo">${CHROME_SELECT}</div>`;

    expect(collectedDomIds()).toEqual(["name"]);
  });

  it.each([
    [
      "footer inside section",
      `<section><footer><input id="f" /></footer></section>`,
    ],
    ["footer inside form", `<form><footer><input id="f" /></footer></form>`],
    [
      "page footer wrapping a form",
      `<footer><form><input id="f" /></form></footer>`,
    ],
  ])("keeps %s controls", (_name, html) => {
    setPageUrl("https://careers.example.test/apply");
    document.body.innerHTML = html;

    expect(collectedDomIds()).toEqual(["f"]);
  });
});

describe("static adapter collection", () => {
  it("does not apply the page chrome exclusion", () => {
    setPageUrl("https://talent.hyundai.com/apply/applyWrite.hc");
    document.body.innerHTML = `<footer><input id="f" /></footer>`;

    expect(collectedDomIds()).toEqual(["f"]);
  });
});
