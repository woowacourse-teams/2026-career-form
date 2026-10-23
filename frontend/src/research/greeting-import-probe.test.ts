import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectFieldsSnapshot } from "../autofill/dom/collect";
import { probeGreetingImport } from "./greeting-import-probe";
import {
  greetingImportFixture,
  universityPrefix,
  universityRow,
} from "./greeting-import-probe.test-fixtures";
import { usePolicyFixture } from "../test/fixtures/execution-policy";

usePolicyFixture("greeting");

const email = "basicInformation.email";
const phone = "basicInformation.phoneNumber.nationalNumber";
const start = `${universityPrefix}.0.enrollmentPeriod.startDate`;
const accordion = '[data-scope="accordion"][data-part="root"]';
function control(name: string): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
}
function candidate(source: string) {
  return probeGreetingImport(document).find((item) => item.source === source);
}

beforeEach(() => {
  document.body.innerHTML = greetingImportFixture();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("Greeting import research", () => {
  it("reads current contact values and keeps two university identities independent of DOM order", () => {
    control(email).value = "changed@example.invalid";
    const result = probeGreetingImport(document);
    expect(result).toContainEqual({
      source: email,
      profileFieldKey: "contact.contact.email",
      value: "changed@example.invalid",
      status: "available",
      reason: "direct",
    });
    expect(result).toContainEqual({
      source: phone,
      profileFieldKey: "contact.contact.phoneNumber",
      value: "01000000000",
      status: "available",
      reason: "direct",
    });
    expect(
      result.filter((item) => item.source.endsWith(".schoolName")),
    ).toEqual([
      {
        source: `${universityPrefix}.0.schoolName`,
        rowIndex: 0,
        profileFieldKey: "education.university.schoolName",
        value: "합성대학교A",
        status: "review",
        reason: "catalog_unverified",
        identity: { status: "manual", originalText: "합성대학교A" },
      },
      {
        source: `${universityPrefix}.1.schoolName`,
        rowIndex: 1,
        profileFieldKey: "education.university.schoolName",
        value: "합성대학교B",
        status: "review",
        reason: "catalog_unverified",
        identity: { status: "manual", originalText: "합성대학교B" },
      },
    ]);
  });

  it("reads the live Greeting unnamed email combobox without confirming or mutating it", () => {
    control(email).closest(
      '[data-scope="field"][data-part="root"]',
    )!.outerHTML = `
      <div data-scope="field" data-part="root" role="group">
        <label for="field-email">이메일주소<span>*</span></label>
        <div data-scope="combobox" data-part="root">
          <div data-scope="combobox" data-part="control">
            <div data-scope="combobox" data-part="trigger">
              <input id="combobox:dynamic:input" type="text" role="combobox"
                data-scope="combobox" data-part="input" value="live-structure@example.invalid">
            </div>
          </div>
        </div>
        <button type="button">이메일 확인</button>
      </div>`;
    const before = document.body.innerHTML;
    const clicks: Event[] = [];
    document
      .querySelector("button")!
      .addEventListener("click", (event) => clicks.push(event));
    expect(candidate(email)).toMatchObject({
      status: "available",
      value: "live-structure@example.invalid",
      profileFieldKey: "contact.contact.email",
    });
    expect(document.body.innerHTML).toBe(before);
    expect(clicks).toEqual([]);
  });

  it("does not guess name components or missing days", () => {
    expect(candidate("basicInformation.name")).toEqual({
      source: "basicInformation.name",
      value: "합성지원자",
      status: "review",
      reason: "name_unsplittable",
    });
    expect(candidate(start)).toMatchObject({
      status: "review",
      reason: "month_precision",
      value: "2020-03",
      precision: "month",
      profileFieldKey: "education.university.startDate",
    });
    expect(
      candidate(`${universityPrefix}.1.enrollmentPeriod.startDate`),
    ).toMatchObject({
      status: "available",
      value: "2022-03-02",
      precision: "day",
    });
  });

  it.each(["disabled", "readonly"])(
    "reads a visible %s field without enabling or editing it",
    (attribute) => {
      control(email).setAttribute(attribute, "");
      const before = control(email).outerHTML;
      expect(candidate(email)).toMatchObject({
        status: "available",
        value: "fixture@example.invalid",
      });
      expect(control(email).outerHTML).toBe(before);
    },
  );

  it.each(["hidden", "inert", "aria-hidden", "css"])(
    "does not extract values from a locked field under a %s ancestor",
    (kind) => {
      control(email).disabled = true;
      const parent = control(email).parentElement!;
      if (kind === "css") parent.style.display = "none";
      else parent.setAttribute(kind, kind === "aria-hidden" ? "true" : "");
      expect(candidate(email)).toMatchObject({ status: "unsupported" });
      expect(candidate(email)).not.toHaveProperty("value");
    },
  );

  it.each(["", "not-an-email", "fixture @example.invalid"])(
    "rejects an empty or invalid email (%s)",
    (value) => {
      control(email).value = value;
      expect(candidate(email)).toMatchObject({ status: "unsupported" });
      expect(candidate(email)).not.toHaveProperty("value");
    },
  );

  it.each([
    "2020.13",
    "2020.02.30",
    "0000.03",
    "2020.3",
    "2020.03-02",
    "입학일",
    "선택",
    "",
  ])("does not invent a date for %s", (value) => {
    control(start).textContent = value;
    expect(candidate(start)).toMatchObject({ status: "unsupported" });
    expect(candidate(start)).not.toHaveProperty("value");
  });

  it.each(["hidden", "password", "file"])(
    "does not read a contact field replaced with input type %s",
    (type) => {
      control(email).type = type;
      expect(candidate(email)).toMatchObject({ status: "unsupported" });
      expect(candidate(email)).not.toHaveProperty("value");
    },
  );

  it("rejects duplicate contact controls rather than picking the first", () => {
    control(email).insertAdjacentHTML(
      "afterend",
      `<input name="${email}" value="other@example.invalid">`,
    );
    expect(candidate(email)).toMatchObject({
      status: "unsupported",
      reason: "ambiguous_field",
    });
    expect(candidate(email)).not.toHaveProperty("value");
  });

  it.each([
    "gap",
    "duplicate-row",
    "duplicate-field",
    "missing-anchor",
    "mixed-prefix",
    "orphan",
    "two-roots",
  ])(
    "isolates malformed university fields or rows (%s) and preserves unambiguous values",
    (kind) => {
      const root = document.querySelector(accordion)!;
      if (kind === "gap") root.innerHTML = universityRow(0) + universityRow(2);
      if (kind === "duplicate-row")
        root.innerHTML = universityRow(0) + universityRow(0);
      if (kind === "duplicate-field")
        control(`${universityPrefix}.0.schoolName`).insertAdjacentHTML(
          "afterend",
          `<input name="${universityPrefix}.0.schoolName">`,
        );
      if (kind === "missing-anchor")
        control(`${universityPrefix}.0.schoolName`).remove();
      if (kind === "mixed-prefix")
        control(`${universityPrefix}.0.schoolName`).name =
          "educationalBackground.graduateSchools.0.schoolName";
      if (kind === "orphan")
        document.body.insertAdjacentHTML(
          "beforeend",
          `<input name="${universityPrefix}.2.schoolName">`,
        );
      if (kind === "two-roots")
        root.insertAdjacentHTML(
          "afterend",
          `<div data-scope="accordion" data-part="root">${universityRow(0)}</div>`,
        );
      const rows = probeGreetingImport(document).filter((item) =>
        item.source.startsWith(universityPrefix),
      );
      const sourceRow = (index: number) =>
        rows.filter((item) => item.rowIndex === index);
      if (kind === "duplicate-row") {
        expect(
          rows.every(
            (item) => item.status === "unsupported" && item.value === undefined,
          ),
        ).toBe(true);
      } else if (kind === "mixed-prefix" || kind === "two-roots") {
        expect(
          sourceRow(0).every(
            (item) => item.status === "unsupported" && item.value === undefined,
          ),
        ).toBe(true);
        expect(sourceRow(1).some((item) => item.value === "합성대학교B")).toBe(
          true,
        );
      } else if (kind === "duplicate-field" || kind === "missing-anchor") {
        expect(candidate(`${universityPrefix}.0.schoolName`)?.status).toBe(
          "unsupported",
        );
        expect(candidate(start)?.value).toBe("2020-03");
        expect(sourceRow(1).some((item) => item.value === "합성대학교B")).toBe(
          true,
        );
      } else if (kind === "orphan") {
        expect(
          sourceRow(2).every(
            (item) => item.status === "unsupported" && item.value === undefined,
          ),
        ).toBe(true);
        expect(candidate(start)?.value).toBe("2020-03");
      } else {
        expect(sourceRow(2).some((item) => item.value === "합성대학교B")).toBe(
          true,
        );
        expect(candidate(start)?.value).toBe("2020-03");
      }
      expect(candidate(email)?.status).toBe("available");
    },
  );

  it("marks missing university fields and collapsed row values unavailable without expanding them", () => {
    control(start).remove();
    control(`${universityPrefix}.1.schoolName`)
      .closest('[data-part="item"]')!
      .setAttribute("hidden", "");
    expect(candidate(start)).toMatchObject({ status: "unsupported" });
    const row = probeGreetingImport(document).filter(
      (item) => item.rowIndex === 1,
    );
    expect(row).toHaveLength(3);
    expect(
      row.every(
        (item) => item.status === "unsupported" && item.value === undefined,
      ),
    ).toBe(true);
  });

  it("rejects an unrecognized document without collecting arbitrary values", () => {
    document.body.innerHTML =
      '<input name="email" value="outside@example.invalid">';
    expect(probeGreetingImport(document)).toEqual([
      {
        source: "document",
        status: "unsupported",
        reason: "unrecognized_document",
      },
    ]);
  });

  it("leaves markup, live values, storage and page events unchanged and keeps values out of analysis payloads", () => {
    control(email).value = "current@example.invalid";
    const before = document.body.innerHTML;
    const liveBefore = [...document.querySelectorAll("input")].map(
      (input) => input.value,
    );
    const events: string[] = [];
    const record = (event: Event) => events.push(event.type);
    const eventNames = ["input", "change", "click", "submit", "focusin"];
    eventNames.forEach((name) => document.addEventListener(name, record));
    const fetch = vi.fn(() => {
      throw new Error("Unexpected network call");
    });
    vi.stubGlobal("fetch", fetch);
    const save = vi.spyOn(Storage.prototype, "setItem");
    try {
      const result = probeGreetingImport(document);
      expect(
        result.filter((item) => item.status !== "unsupported"),
      ).toHaveLength(9);
      expect(
        result.filter((item) => item.reason === "no_profile_mapping"),
      ).toHaveLength(2);
      expect(
        result.some((item) => item.value === "current@example.invalid"),
      ).toBe(true);
      expect(JSON.stringify(result)).not.toMatch(
        /synthetic-secret|합성 제외 내용/,
      );
      expect(document.body.innerHTML).toBe(before);
      expect(
        [...document.querySelectorAll("input")].map((input) => input.value),
      ).toEqual(liveBefore);
      expect(events).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
      const payload = JSON.stringify(collectFieldsSnapshot(document).request);
      expect(payload).not.toMatch(
        /current@example.invalid|합성대학교[AB]|합성지원자|010-0000-0000|2020|2022|2024/,
      );
    } finally {
      eventNames.forEach((name) => document.removeEventListener(name, record));
    }
  });
});
