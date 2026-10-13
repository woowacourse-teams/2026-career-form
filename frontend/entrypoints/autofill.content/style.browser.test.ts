import { afterEach, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import styles from "./style.css?inline";

const fixtures: HTMLElement[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.remove();
});

function mountPanel() {
  const fixture = document.createElement("div");
  const behind = document.createElement("button");
  behind.textContent = "Underlying application";
  behind.style.cssText = "position: fixed; inset: 0";
  const outside = document.createElement("input");
  outside.setAttribute("aria-label", "Outside field");
  outside.style.cssText = "position: fixed; top: 16px; left: 16px";
  const host = document.createElement("career-form-profile-panel");
  const shadow = host.attachShadow({ mode: "open" });
  const sheet = document.createElement("style");
  // Match the WXT reset followed by the unchanged product stylesheet.
  sheet.textContent = `:host { all: initial !important; }\n${styles}`;
  const panel = document.createElement("div");
  panel.className = "career-form-in-page-panel";
  const inside = document.createElement("button");
  inside.textContent = "Panel action";
  inside.style.cssText = "margin: 20px; padding: 12px";
  panel.append(inside);
  shadow.append(sheet, panel);
  fixture.append(behind, outside, host);
  document.body.append(fixture);
  fixtures.push(fixture);
  return { behind, outside, inside };
}

it("lets a pointer click focus an application field outside the shadow panel", async () => {
  const { outside } = mountPanel();
  let clicks = 0;
  outside.addEventListener("click", () => clicks++);

  await userEvent.click(outside);

  expect(clicks).toBe(1);
  expect(document.activeElement).toBe(outside);
});

it("delivers an inside pointer click only to the shadow panel action", async () => {
  const { behind, inside } = mountPanel();
  let applicationClicks = 0;
  let panelClicks = 0;
  behind.addEventListener("click", () => applicationClicks++);
  inside.addEventListener("click", () => panelClicks++);

  await userEvent.click(inside);

  expect(panelClicks).toBe(1);
  expect(applicationClicks).toBe(0);
});
