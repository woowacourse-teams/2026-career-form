import { afterEach, expect, it } from "vitest";
import { customFieldValue } from "./custom-field-value";
import type { FieldCandidateHandle } from "./types";

afterEach(() => document.body.replaceChildren());

it.each([
  [null, "2000. 01. 01"],
  ["false", "2000. 01. 01"],
  ["true", ""],
  ["", ""],
])("reads custom date value with placeholder marker %s", (marker, expected) => {
  const element = document.createElement("button");
  element.textContent = "2000. 01. 01";
  if (marker !== null) element.setAttribute("data-placeholder", marker);
  document.body.append(element);
  const handle = {
    candidate: { control: "button" },
    customElements: [element],
  } as unknown as FieldCandidateHandle;

  expect(customFieldValue(handle)).toBe(expected);
});

it.each([
  ["", "만점기준", ""],
  ["true", "만점기준", ""],
  ["false", "4.5", "4.5"],
  [null, "4.5", "4.5"],
])("reads select placeholder-shown=%s as %s", (marker, text, expected) => {
  const element = document.createElement("button");
  element.textContent = text;
  if (marker !== null) element.setAttribute("data-placeholder-shown", marker);
  document.body.append(element);
  const handle = {
    candidate: { control: "button" },
    customElements: [element],
  } as unknown as FieldCandidateHandle;
  expect(customFieldValue(handle)).toBe(expected);
});
