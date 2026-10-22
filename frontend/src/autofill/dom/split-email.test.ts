import { describe, expect, it } from "vitest";
import { isSplitEmailTarget } from "./split-email";
import type { FieldCandidateHandle } from "./types";

function mount(html: string): FieldCandidateHandle {
  document.body.innerHTML = html;
  const input = document.querySelector<HTMLInputElement>("input#email_id")!;
  return { elements: [input] } as unknown as FieldCandidateHandle;
}

describe("isSplitEmailTarget", () => {
  it("recognizes a local input, a literal @ and a select whose labels are domains", () => {
    const handle = mount(
      `<form><div><input id="email_id" type="text"><span>@</span><select><option value="">선택</option><option value="gmail.com">gmail.com</option></select></div></form>`,
    );
    expect(isSplitEmailTarget(handle)).toBe(true);
  });

  it("recognizes the pair when only the option values are domains", () => {
    const handle = mount(
      `<form><div><input id="email_id" type="text"><span>@</span><select><option value="">선택</option><option value="gmail.com">지메일</option><option value="naver.com">[TEXT]</option></select></div></form>`,
    );
    expect(isSplitEmailTarget(handle)).toBe(true);
  });

  it("rejects a pair without the literal separator or without a domain option", () => {
    expect(
      isSplitEmailTarget(
        mount(
          `<form><div><input id="email_id" type="text"><select><option value="gmail.com">gmail.com</option></select></div></form>`,
        ),
      ),
    ).toBe(false);
    expect(
      isSplitEmailTarget(
        mount(
          `<form><div><input id="email_id" type="text"><span>@</span><select><option value="1">직접입력</option><option value="2">회사</option></select></div></form>`,
        ),
      ),
    ).toBe(false);
  });
});
