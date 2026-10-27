import { describe, expect, it } from "vitest";
import {
  isSplitEmailMember,
  isSplitEmailTarget,
  splitEmailRetained,
  writeSplitEmail,
} from "./split-email";
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

const SELECT = `<select id="domain"><option value="">선택</option><option value="gmail.com">gmail.com</option><option value="self">직접입력</option></select>`;

function revealOnCustom(selector = "#domain_text") {
  const select = document.querySelector<HTMLSelectElement>("#domain")!;
  select.addEventListener("change", () => {
    const text = document.querySelector<HTMLInputElement>(selector)!;
    text.style.display = select.value === "self" ? "" : "none";
  });
}

const value = (selector: string) =>
  document.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!.value;

describe("split email custom domain entry", () => {
  it("recognizes the pair with a revealed domain text input after the select", () => {
    const handle = mount(
      `<form><div><input id="email_id"><span>@</span>${SELECT}<input id="domain_text" style="display:none"></div></form>`,
    );
    expect(isSplitEmailTarget(handle)).toBe(true);
    document.querySelector<HTMLInputElement>("#domain_text")!.style.display =
      "";
    expect(isSplitEmailTarget(handle)).toBe(true);
  });

  it("selects the single custom option and writes the domain into the revealed input", () => {
    const handle = mount(
      `<form><div><input id="email_id"><span>@</span>${SELECT}<input id="domain_text" style="display:none"></div></form>`,
    );
    revealOnCustom();
    expect(writeSplitEmail(handle, "qa@other.test")).toBe("written");
    expect(value("#email_id")).toBe("qa");
    expect(value("#domain")).toBe("self");
    expect(value("#domain_text")).toBe("other.test");
    expect(splitEmailRetained(handle, "qa@other.test")).toBe(true);
  });

  it("writes the domain into an input inserted into the group on selection", () => {
    const handle = mount(
      `<form><div id="group"><input id="email_id"><span>@</span>${SELECT}</div></form>`,
    );
    document
      .querySelector("#domain")!
      .addEventListener("change", () =>
        document
          .querySelector("#group")!
          .insertAdjacentHTML("beforeend", '<input id="domain_text">'),
      );
    expect(writeSplitEmail(handle, "qa@other.test")).toBe("written");
    expect(value("#domain_text")).toBe("other.test");
    expect(splitEmailRetained(handle, "qa@other.test")).toBe(true);
  });

  it("writes only the local part when no custom option exists", () => {
    const handle = mount(
      `<form><div><input id="email_id"><span>@</span><select id="domain"><option value="">선택</option><option value="gmail.com">gmail.com</option></select></div></form>`,
    );
    expect(writeSplitEmail(handle, "qa@other.test")).toBe("partial");
    expect(value("#email_id")).toBe("qa");
    expect(value("#domain")).toBe("");
  });

  it("writes only the local part when two custom options exist", () => {
    const handle = mount(
      `<form><div><input id="email_id"><span>@</span><select id="domain"><option value="">선택</option><option value="gmail.com">gmail.com</option><option value="a">직접입력</option><option value="b">직접 입력</option></select><input id="domain_text"></div></form>`,
    );
    expect(writeSplitEmail(handle, "qa@other.test")).toBe("partial");
    expect(value("#email_id")).toBe("qa");
    expect(value("#domain")).toBe("");
    expect(value("#domain_text")).toBe("");
  });

  it("restores the select when choosing the custom option reveals no input", () => {
    const handle = mount(
      `<form><div><input id="email_id"><span>@</span>${SELECT}</div></form>`,
    );
    expect(writeSplitEmail(handle, "qa@other.test")).toBe("partial");
    expect(value("#email_id")).toBe("qa");
    expect(value("#domain")).toBe("");
  });

  it("restores the select when two inputs are revealed", () => {
    const handle = mount(
      `<form><div id="group"><input id="email_id"><span>@</span>${SELECT}</div></form>`,
    );
    document
      .querySelector("#domain")!
      .addEventListener("change", () =>
        document
          .querySelector("#group")!
          .insertAdjacentHTML("beforeend", "<input><input>"),
      );
    expect(writeSplitEmail(handle, "qa@other.test")).toBe("partial");
    expect(value("#email_id")).toBe("qa");
    expect(value("#domain")).toBe("");
  });

  it("keeps the exact domain option path unchanged", () => {
    const handle = mount(
      `<form><div><input id="email_id"><span>@</span>${SELECT}<input id="domain_text" style="display:none"></div></form>`,
    );
    revealOnCustom();
    expect(writeSplitEmail(handle, "qa@gmail.com")).toBe("written");
    expect(value("#domain")).toBe("gmail.com");
    expect(value("#domain_text")).toBe("");
  });

  it("identifies the domain select and domain input as pair members", () => {
    mount(
      `<form><div><input id="email_id"><span>@</span><span>${SELECT}</span><input id="domain_text"></div></form>`,
    );
    expect(isSplitEmailMember(document.querySelector("#domain")!)).toBe(true);
    expect(isSplitEmailMember(document.querySelector("#domain_text")!)).toBe(
      true,
    );
    expect(isSplitEmailMember(document.querySelector("#email_id")!)).toBe(
      false,
    );
  });
});
