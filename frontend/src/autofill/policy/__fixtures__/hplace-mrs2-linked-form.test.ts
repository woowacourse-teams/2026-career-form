import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  disposeLinkedForms,
  installLinkedForm,
} from "./hplace-mrs2-linked-form";

const el = <T extends Element = HTMLInputElement>(selector: string) =>
  document.querySelector<T & Element>(selector)!;
const disabled = (selector: string) => el<HTMLInputElement>(selector).disabled;

beforeEach(() => {
  document.body.innerHTML = `<form id="frm">
    <div class="span radio" data-rel-id="row[0]">
      <label><input type="radio" name="row[0].kind" value=""></label>
      <label><input type="radio" name="row[0].kind" value="50"></label>
    </div>
    <input name="row[0].text" data-rel-target="row[0]" disabled>
    <input class="hidden" name="row[0].child[0].code" data-rel-target="row[0]" data-rel-id="row[0].child[0]" disabled>
    <input type="radio" name="row[0].child[0].type" value="01" data-rel-target="row[0].child[0]" disabled>
    <div class="span radio" data-rel-id="row[0].status" data-rel-type="with" data-rel-value="LEAVE">
      <label><input type="radio" name="row[0].status" value="WORK" data-rel-target="row[0]" disabled></label>
      <label><input type="radio" name="row[0].status" value="LEAVE" data-rel-target="row[0]" disabled></label>
    </div>
    <input name="row[0].leaving" data-rel-target="row[0].status" disabled>
    <select name="pick" data-rel-id="pick"><option value=""></option><option value="900001">A</option></select>
    <input name="pick.text" data-rel-target="pick" disabled>
    <select name="relation" data-rel-id="relation" data-rel-type="without" data-rel-value="90"><option value=""></option><option value="10">B</option><option value="90">C</option></select>
    <input name="relation.text" data-rel-target="relation" disabled>
    <div data-rel-target="relation" data-rel-hide="true" style="display:none"></div>
  </form>`;
});
afterEach(() => {
  disposeLinkedForms();
  vi.useRealTimers();
});

it("enables [data-rel-target=id] when a wrapped radio with a value is clicked", () => {
  installLinkedForm(el("#frm"), { init: false });
  el('[name="row[0].kind"][value="50"]').click();
  expect(disabled('[name="row[0].text"]')).toBe(false);
  el('[name="row[0].kind"][value=""]').click();
  expect(disabled('[name="row[0].text"]')).toBe(true);
});

it("enables select default targets for non-empty values and disables them recursively", () => {
  installLinkedForm(el("#frm"), { init: false });
  const select = el<HTMLSelectElement>('[name="pick"]');
  select.value = "900001";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  expect(disabled('[name="pick.text"]')).toBe(false);
  select.value = "";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  expect(disabled('[name="pick.text"]')).toBe(true);
});

it("applies with and without data-rel-value lists", () => {
  installLinkedForm(el("#frm"), { init: false });
  el('[name="row[0].kind"][value="50"]').click();
  el('[name="row[0].status"][value="LEAVE"]').click();
  expect(disabled('[name="row[0].leaving"]')).toBe(false);
  el('[name="row[0].status"][value="WORK"]').click();
  expect(disabled('[name="row[0].leaving"]')).toBe(true);
  const relation = el<HTMLSelectElement>('[name="relation"]');
  relation.value = "10";
  relation.dispatchEvent(new Event("change", { bubbles: true }));
  expect(disabled('[name="relation.text"]')).toBe(false);
  expect(el<HTMLElement>("[data-rel-hide]").style.display).toBe("");
  relation.value = "90";
  relation.dispatchEvent(new Event("change", { bubbles: true }));
  expect(disabled('[name="relation.text"]')).toBe(true);
  expect(el<HTMLElement>("[data-rel-hide]").style.display).toBe("none");
});

it("evaluates input[data-rel-id] by a 200ms focus poll and immediately on blur", () => {
  vi.useFakeTimers();
  installLinkedForm(el("#frm"), { init: false });
  el('[name="row[0].kind"][value="50"]').click();
  const code = el('[name="row[0].child[0].code"]');
  expect(code.disabled).toBe(false);
  expect(disabled('[name="row[0].child[0].type"]')).toBe(true);
  code.focus();
  code.value = "900001";
  vi.advanceTimersByTime(199);
  expect(disabled('[name="row[0].child[0].type"]')).toBe(true);
  vi.advanceTimersByTime(1);
  expect(disabled('[name="row[0].child[0].type"]')).toBe(false);
  code.value = " ";
  code.blur();
  expect(disabled('[name="row[0].child[0].type"]')).toBe(true);
  code.value = "900001";
  vi.advanceTimersByTime(1000);
  expect(disabled('[name="row[0].child[0].type"]')).toBe(true);
});

it("re-evaluates nested relations when a parent enables them", () => {
  vi.useFakeTimers();
  installLinkedForm(el("#frm"), { init: false });
  el('[name="row[0].kind"][value="50"]').click();
  el('[name="row[0].status"][value="LEAVE"]').click();
  el('[name="row[0].kind"][value=""]').click();
  expect(disabled('[name="row[0].leaving"]')).toBe(true);
  el('[name="row[0].kind"][value="50"]').click();
  // The checked LEAVE radio is re-clicked 50ms after its parent is enabled.
  expect(disabled('[name="row[0].leaving"]')).toBe(true);
  vi.advanceTimersByTime(50);
  expect(disabled('[name="row[0].leaving"]')).toBe(false);
});

it("initializes the state from the rendered values like the page load", () => {
  for (const e of document.querySelectorAll<HTMLInputElement>(
    "[data-rel-target]",
  ))
    e.disabled = false;
  installLinkedForm(el("#frm"));
  expect(disabled('[name="row[0].text"]')).toBe(true);
  expect(disabled('[name="pick.text"]')).toBe(true);
  expect(disabled('[name="relation.text"]')).toBe(true);
});

it("removes listeners, polls and pending clicks on dispose", () => {
  vi.useFakeTimers();
  const form = installLinkedForm(el("#frm"), { init: false });
  el('[name="row[0].kind"][value="50"]').click();
  const code = el('[name="row[0].child[0].code"]');
  code.focus();
  form.dispose();
  code.value = "900001";
  vi.advanceTimersByTime(1000);
  expect(disabled('[name="row[0].child[0].type"]')).toBe(true);
  el('[name="row[0].kind"][value=""]').click();
  expect(disabled('[name="row[0].text"]')).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
