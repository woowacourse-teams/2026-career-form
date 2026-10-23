/** CF-177 C12: the synthetic step 2 builders against the sanitized live
 * structure (frontend/fixtures/dom-snapshots/hplace-mrs2-step{2,3}-*).
 * Compared per control: name (row indexes folded), type, initial disabled,
 * data-rel-target/-id, data-dates and select option count; per gating
 * wrapper: data-rel-id/-type and the data-rel-value token count. Text, option
 * codes, buttons and layout wrappers are out of scope (the fixtures carry
 * none of the former, and the builders do not model the latter). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import seed from "../../../../backend/src/main/resources/policies/hplace-mrs2-v4.json";
import { collectFieldsSnapshot } from "../dom/collect";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "../workflow/execution-policy";
import {
  mountEducation,
  type EducationFixtureOptions,
} from "./__fixtures__/hplace-mrs2-education.synthetic";
import {
  appendCareerSection,
  type CareerFixtureOptions,
} from "./__fixtures__/hplace-mrs2-career.synthetic";
import { disposeLinkedForms } from "./__fixtures__/hplace-mrs2-linked-form";

afterEach(() => {
  disposeLinkedForms();
  installExecutionPolicy(document);
  document.body.replaceChildren();
});

const fixture = (site: string, step: number) =>
  readFileSync(
    join(
      process.cwd(),
      `fixtures/dom-snapshots/hplace-mrs2-step${step}-${site}/sanitized.html`,
    ),
    "utf8",
  );
const fold = (value: string | null) =>
  value === null
    ? null
    : value
        .replace(/\[\d+\]/g, "[i]")
        .replace(/\s+/g, " ")
        .trim();

type Shape = Record<string, Record<string, unknown>>;
function shape(root: ParentNode): Shape {
  const result: Shape = {};
  const seen: Record<string, number> = {};
  const add = (key: string, value: Record<string, unknown>) => {
    seen[key] = (seen[key] ?? 0) + 1;
    result[`${key}#${seen[key]}`] = value;
  };
  for (const control of root.querySelectorAll(
    "input:not([type=file]), select, textarea",
  )) {
    const type =
      control.tagName === "INPUT"
        ? (control.getAttribute("type") ?? "text")
        : control.tagName.toLowerCase();
    const name = fold(control.getAttribute("name"));
    add(
      name
        ? /^(radio|checkbox)$/.test(type)
          ? `${name}:${type}`
          : name
        : `<${type} data-type=${control.getAttribute("data-type")}>`,
      {
        type,
        disabled: control.hasAttribute("disabled"),
        relTarget: fold(control.getAttribute("data-rel-target")),
        relId: fold(control.getAttribute("data-rel-id")),
        dates: fold(control.getAttribute("data-dates")),
        options:
          control.tagName === "SELECT"
            ? control.querySelectorAll("option").length
            : null,
      },
    );
  }
  for (const wrapper of root.querySelectorAll(
    "div[data-rel-id], span[data-rel-id]",
  ))
    add(`@${fold(wrapper.getAttribute("data-rel-id"))}`, {
      relType: wrapper.getAttribute("data-rel-type"),
      relValues: wrapper.getAttribute("data-rel-value")?.split(",").length ?? 0,
    });
  return result;
}

interface SiteShape {
  sections: string[];
  education: EducationFixtureOptions;
  career: CareerFixtureOptions;
}
// Tenant options observed in the 2026-10-20 sanitized structure.
const SITES: Record<string, SiteShape> = {
  gsenc: {
    sections: ["140", "141", "142", "16"],
    education: {
      liveGating: true,
      dateInputFormat: "YM",
      highschool: {},
      collegeCategory: { college: false },
      graduateEntranceType: false,
    },
    career: { labels: "nine", project: {} },
  },
  careerhyundai: {
    sections: ["140", "141", "142", "16"],
    education: {
      liveGating: true,
      dateInputFormat: "YMD",
      highschool: { dayOrNight: true },
    },
    career: { labels: "seven" },
  },
  abl: {
    sections: ["141", "142", "16"],
    education: {
      liveGating: true,
      dateInputFormat: "YM",
      highschool: false,
      graduateEntranceType: false,
      majorScore: { college: true },
    },
    career: {
      labels: "nine",
      salary: true,
      project: { contributionRate: true },
      experienceBuilder: true,
    },
  },
};

function mountBuilder({ education, career }: SiteShape) {
  mountEducation(1, 1, false, education);
  appendCareerSection(1, career);
}

// The fixture holds only the sections. Like the builders, the mount adds the
// page skeleton the policy fingerprints (asset tags and the #wrapResume root
// between form#frm and the sections); nothing inside a section is added.
function mountLive(site: string) {
  window.history.replaceState({}, "", "/mrs2/applicant/resume/writeResume");
  const live = new DOMParser().parseFromString(fixture(site, 2), "text/html");
  const sections = [...live.querySelectorAll("form#frm > section")]
    .map((section) => section.outerHTML)
    .join("");
  document.body.innerHTML =
    seed.executionPolicy.browserPolicy.nativeForm.assetPaths
      .map((src) => `<script src="${src}"></script>`)
      .join("") +
    `<form id="frm"><div id="wrapResume">${sections}</div></form>`;
  installExecutionPolicy(
    document,
    structuredClone(seed.executionPolicy) as unknown as ExecutionPolicy,
  );
}

const sectionShape = (root: Document, code: string) =>
  shape(root.querySelector(`section[data-code="${code}"]`)!);

const collected = () =>
  collectFieldsSnapshot(document).request.sections.map((section) => ({
    sectionId: section.sectionId,
    fields: section.fields.map((field) => field.domName).sort(),
    items: (section.items ?? []).map((item) =>
      item.fields.map((field) => field.domName).sort(),
    ),
  }));

describe.each(Object.entries(SITES))("%s step 2", (site, options) => {
  it.each(options.sections)(
    "builder section %s matches the live structure",
    (code) => {
      const live = new DOMParser().parseFromString(
        fixture(site, 2),
        "text/html",
      );
      mountBuilder(options);
      expect(sectionShape(document, code)).toEqual(sectionShape(live, code));
    },
  );

  it("the builder has no section the live page lacks", () => {
    mountBuilder(options);
    expect(
      [...document.querySelectorAll("section[data-code]")].map((s) =>
        s.getAttribute("data-code"),
      ),
    ).toEqual(options.sections);
  });

  it("native collection reads the same sections and fields from both", () => {
    mountLive(site);
    const fromLive = collected();
    disposeLinkedForms();
    mountBuilder(options);
    expect(collected()).toEqual(fromLive);
    expect(fromLive.length).toBeGreaterThan(0);
  });
});

describe("step 3 license row", () => {
  it.each(["gsenc", "careerhyundai", "abl"])(
    "%s gates organization/registNumber/acquireDate behind licenseCode",
    (site) => {
      const live = new DOMParser().parseFromString(
        fixture(site, 3),
        "text/html",
      );
      const row = live.querySelector("[data-loop=license]")!;
      expect(
        row
          .querySelector('[name="license[0].licenseCode"]')!
          .getAttribute("data-rel-id"),
      ).toBe("license[0]");
      for (const name of ["organization", "registNumber", "acquireDate"]) {
        const input = row.querySelector(`[name="license[0].${name}"]`)!;
        expect(input.getAttribute("data-rel-target")).toBe("license[0]");
        expect(input.hasAttribute("disabled")).toBe(true);
      }
      expect(
        row
          .querySelector('[name="license[0].registNumber"]')!
          .getAttribute("maxlength"),
      ).toBe("64");
    },
  );
});
