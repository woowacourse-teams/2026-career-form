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
    [
      "footer inside article",
      `<article><footer><input id="f" /></footer></article>`,
    ],
    ["footer inside aside", `<aside><footer><input id="f" /></footer></aside>`],
    ["footer inside main", `<main><footer><input id="f" /></footer></main>`],
    ["footer inside nav", `<nav><footer><input id="f" /></footer></nav>`],
    [
      "footer inside dialog",
      `<dialog open><footer><input id="f" /></footer></dialog>`,
    ],
    [
      "footer inside role=dialog",
      `<div role="dialog"><footer><input id="f" /></footer></div>`,
    ],
    [
      "footer inside role=alertdialog",
      `<div role="alertdialog"><footer><input id="f" /></footer></div>`,
    ],
    [
      "footer inside role=main",
      `<div role="main"><footer><input id="f" /></footer></div>`,
    ],
    [
      "footer inside role=region",
      `<div role="region"><footer><input id="f" /></footer></div>`,
    ],
    [
      "footer inside role=article",
      `<div role="article"><footer><input id="f" /></footer></div>`,
    ],
    [
      "footer inside role=complementary",
      `<div role="complementary"><footer><input id="f" /></footer></div>`,
    ],
    [
      "footer inside role=navigation",
      `<div role="navigation"><footer><input id="f" /></footer></div>`,
    ],
    [
      "contentinfo inside role=dialog",
      `<div role="dialog"><div role="contentinfo"><input id="f" /></div></div>`,
    ],
    [
      "contentinfo inside dialog",
      `<dialog open><div role="contentinfo"><input id="f" /></div></dialog>`,
    ],
    [
      "control tied to a form by the form attribute",
      `<form id="apply"></form><footer><input id="f" form="apply" /></footer>`,
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

describe("generic collection of button dropdown triggers", () => {
  const dropdownFor = (trigger: HTMLElement) => {
    const menu = document.createElement("ul");
    const option = document.createElement("li");
    option.textContent = "가";
    menu.append(option);
    document.body.append(menu);
    return {
      trigger,
      field: trigger,
      scope: trigger.parentElement as HTMLElement,
      scopeId: "scope",
      menu,
      initialText: "선택",
      controls: null,
      options: [{ element: option, text: "가" }],
    };
  };
  const collectedWith = (selector: string) => {
    const trigger = document.querySelector<HTMLElement>(selector)!;
    return collectFieldsSnapshot(
      document,
      new Map([[trigger, dropdownFor(trigger)]]),
    ).request.sections.flatMap((section) =>
      section.fields.map(({ domId }) => domId),
    );
  };

  it("skips a dropdown trigger in a page footer", () => {
    setPageUrl("https://careers.example.test/apply");
    document.body.innerHTML = `<footer><div><button id="t" type="button">선택</button></div></footer>`;
    expect(collectedWith("#t")).toEqual([]);
  });

  it("keeps a dropdown trigger outside page chrome", () => {
    setPageUrl("https://careers.example.test/apply");
    document.body.innerHTML = `<div><button id="t" type="button">선택</button></div>`;
    expect(collectedWith("#t")).toEqual(["t"]);
  });
});
