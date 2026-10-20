import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountEducation } from "./hplace-mrs2-education.synthetic";
import { disposeLinkedForms } from "./hplace-mrs2-linked-form";
import { installExecutionPolicy } from "../../workflow/execution-policy";

const digest = () =>
  createHash("sha256").update(document.body.innerHTML).digest("hex");
const q = <T extends Element = HTMLInputElement>(selector: string) =>
  document.querySelector<T & Element>(selector)!;
const all = (selector: string) =>
  Array.from(document.querySelectorAll<HTMLInputElement>(selector));
const named = (name: string) => q(`[name="${name}"]`);

afterEach(() => {
  disposeLinkedForms();
  vi.useRealTimers();
  document.body.replaceChildren();
  installExecutionPolicy(document);
});

describe("default DOM (existing suites depend on it byte for byte)", () => {
  // Digests of the pre-CF-177-C0 builder output.
  it.each([
    [[], "a4e63892a7c6a2842294c0e6d0536dc30786bd5810f2512ec05fbf7bd0176686"],
    [[1], "3db58271a20b0ae8ea81447837bd85ba2a2c1a36b80cfc01d6e0dbc116530fc1"],
    [
      [2, 1, true],
      "5b9bfdeb1d1f6b61cb01f43425cf78efad442c861a0d9610ad9a1b08bf518875",
    ],
    [
      [1, 3, false],
      "2aaf50b73be368f3edbdf09d624d57765af43d9a65d335cd723fd34d6c08a175",
    ],
    [
      [3, 2, true],
      "ac8675045590dba4d47625f99f0e82f0aa75633b0a795898d2a2fc2198facfb3",
    ],
  ] as const)("mountEducation(%j)", (args, expected) => {
    mountEducation(...(args as unknown as [number?, number?, boolean?]));
    expect(digest()).toBe(expected);
    const [count = 2, majors = 1, enabled = false] = args as readonly [
      number?,
      number?,
      boolean?,
    ];
    mountEducation(count, majors, enabled, {});
    expect(digest()).toBe(expected);
  });

  it("keeps the added parent and major rows identical", () => {
    mountEducation(1, 1, false);
    q<HTMLButtonElement>('[data-loopname="college"]').click();
    q<HTMLButtonElement>('[data-loopname="graduateSchool"]').click();
    expect(digest()).toBe(
      "701d29b5353ec5cd430ce7925747e22edaee3ebdfb646b799a48168880d7055a",
    );
  });
});

describe("dateInputFormat", () => {
  it("renders YMD date tokens on every education row", () => {
    mountEducation(1, 1, false, { dateInputFormat: "YMD" });
    for (const wrap of all("[data-wrap=collegeLoop]"))
      expect(wrap.getAttribute("data-dateinputformat")).toBe("YMD");
    expect(named("college[0].entranceDate").getAttribute("data-dates")).toBe(
      "college[0].date:YMD college graduationCriteriaDate",
    );
    expect(
      named("graduateSchool[0].entranceDate").getAttribute("data-dates"),
    ).toBe("graduateSchool[0].date:YMD college graduationCriteriaDate");
    expect(named("college[0].graduationDate").getAttribute("data-dates")).toBe(
      "college[0].date:END",
    );
  });

  it("lets addCollege read the wrapCollege data-dateinputformat", () => {
    mountEducation(1, 1, false);
    q('[data-wrap=collegeLoop][data-type="college"]').setAttribute(
      "data-dateinputformat",
      "YMD",
    );
    q<HTMLButtonElement>('[data-loopname="college"]').click();
    expect(named("college[1].entranceDate").getAttribute("data-dates")).toBe(
      "college[1].date:YMD college graduationCriteriaDate",
    );
  });
});

describe("highschool (section 140)", () => {
  it("renders the live 140 structure without values", () => {
    mountEducation(1, 1, false, { highschool: {} });
    const section = q('section.writeResume[data-code="140"]');
    expect(section.nextElementSibling?.getAttribute("data-code")).toBe("141");
    const radios = all('[name="highschool.graduationTypeCode"]');
    expect(radios.map((r) => r.value)).toEqual([
      "01",
      "02",
      "04",
      "05",
      "07",
      "08",
    ]);
    expect(radios.every((r) => r.required && !r.checked)).toBe(true);
    expect(
      radios[0].closest("[data-rel-id]")?.getAttribute("data-rel-id"),
    ).toBe("highschool");
    const search = q(
      'input[type=search][data-type="highschool"][data-rel-target="highschool"]',
    );
    expect(search.disabled).toBe(true);
    for (const name of ["academyActivitySn", "academyName"]) {
      const hidden = named(`highschool.${name}`);
      expect(hidden.type).toBe("hidden");
      expect(hidden.disabled).toBe(true);
    }
    const code = named("highschool.academyCode");
    expect([code.type, code.className, code.disabled, code.required]).toEqual([
      "text",
      "hidden",
      true,
      true,
    ]);
    expect(
      q<HTMLSelectElement>('[name="highschool.locationCode"]').options,
    ).toHaveLength(47);
    expect(
      q<HTMLSelectElement>('[name="highschool.locationCode"]').disabled,
    ).toBe(true);
    expect(
      q<HTMLSelectElement>('[name="highschool.highschoolCategoryCode"]')
        .disabled,
    ).toBe(true);
    expect(all('[name="highschool.dayOrNight"]')).toHaveLength(0);
    expect(named("highschool.entranceDate").getAttribute("data-dates")).toBe(
      "highschoolDate:YM  highschool graduationCriteriaDate",
    );
    expect(named("highschool.graduationDate").getAttribute("data-dates")).toBe(
      "highschoolDate:END",
    );
  });

  it("adds the optional empty radio and day/night radios", () => {
    mountEducation(1, 1, false, {
      dateInputFormat: "YMD",
      highschool: { emptyRadio: true, dayOrNight: true },
    });
    const radios = all('[name="highschool.graduationTypeCode"]');
    expect(radios.map((r) => r.value)).toEqual([
      "",
      "01",
      "02",
      "04",
      "05",
      "07",
      "08",
    ]);
    expect(radios[0].parentElement!.textContent).toBe("작성안함");
    expect(all('[name="highschool.dayOrNight"]').map((r) => r.value)).toEqual([
      "01",
      "02",
    ]);
    expect(named("highschool.entranceDate").getAttribute("data-dates")).toBe(
      "highschoolDate:YMD  highschool graduationCriteriaDate",
    );
  });

  it("enables the query, hidden tuple and dates only on a graduation click", () => {
    mountEducation(1, 1, false, { highschool: { dayOrNight: true } });
    const gated = all('[data-rel-target="highschool"]');
    expect(gated.length).toBeGreaterThan(5);
    expect(gated.every((e) => e.disabled)).toBe(true);
    named("highschool.graduationTypeCode").click();
    expect(gated.every((e) => !e.disabled)).toBe(true);
    expect(named("highschool.academyName").disabled).toBe(false);
  });
});

describe("liveGating (sections 141/142)", () => {
  it("wraps degree radios and renders rel-target controls disabled", () => {
    mountEducation(1, 1, false, { liveGating: true });
    const wrapper = q('[data-loop="college"] [data-rel-id="college[0]"]');
    expect(
      Array.from(
        wrapper.querySelectorAll<HTMLInputElement>(
          '[name="college[0].degreeTypeCode"]',
        ),
        (r) => r.value,
      ),
    ).toEqual(["40", "50"]);
    expect(
      all('[name="graduateSchool[0].degreeTypeCode"]').map((r) => r.value),
    ).toEqual(["62", "72"]);
    for (const name of [
      "academyCode",
      "locationCode",
      "headOrBranch",
      "entranceDate",
      "graduationDate",
      "entranceTypeCode",
      "graduationTypeCode",
      "collegeCategoryCode",
      "score",
    ])
      for (const e of all(`[name="college[0].${name}"]`)) {
        expect(e.getAttribute("data-rel-target")).toBe("college[0]");
        expect(e.disabled).toBe(true);
      }
    expect(
      all('[name="college[0].graduationTypeCode"]').map((r) => r.value),
    ).toEqual(["01", "02", "03", "04", "05", "07", "08"]);
    expect(named("college[0].academyName").disabled).toBe(false);
    expect(
      q('input[type=search][data-type="college"]').getAttribute(
        "data-rel-target",
      ),
    ).toBe("college[0]");
    expect(
      q('input[type=search][data-type="major"]').getAttribute(
        "data-rel-target",
      ),
    ).toBe("college[0]");
    const majorCode = named("college[0].collegeMajor[0].majorCode");
    expect(majorCode.getAttribute("data-rel-id")).toBe(
      "college[0].collegeMajor[0]",
    );
    for (const name of ["majorTypeCode", "majorCategoryCode", "dayOrNight"])
      for (const e of all(`[name="college[0].collegeMajor[0].${name}"]`)) {
        expect(e.getAttribute("data-rel-target")).toBe(
          "college[0].collegeMajor[0]",
        );
        expect(e.disabled).toBe(true);
      }
    expect(
      q('[name="college[0].collegeMajor[0].majorCategoryCode"]').getAttribute(
        "data-rel-type",
      ),
    ).toBe("with");
    expect(
      q<HTMLButtonElement>(
        '[data-loop="college"] button[data-button=add][data-rel-target="college[0]"]',
      ).disabled,
    ).toBe(true);
    expect(named("college[0].score").getAttribute("data-rel-id")).toBe(
      "college[0].perfectScore",
    );
    expect(
      named("college[0].perfectScore").getAttribute("data-rel-target"),
    ).toBe("college[0].perfectScore");
  });

  it("enables the row on a degree click and major details only by focus poll or blur", () => {
    vi.useFakeTimers();
    mountEducation(1, 1, false, { liveGating: true });
    q<HTMLInputElement>(
      '[name="college[0].degreeTypeCode"][value="50"]',
    ).click();
    for (const e of all('[data-rel-target="college[0]"]'))
      expect(e.disabled).toBe(false);
    const details = () =>
      all('[data-rel-target="college[0].collegeMajor[0]"]').map(
        (e) => e.disabled,
      );
    expect(details().every(Boolean)).toBe(true);
    const code = named("college[0].collegeMajor[0].majorCode");
    code.focus();
    code.value = "900001";
    expect(details().every(Boolean)).toBe(true);
    vi.advanceTimersByTime(200);
    expect(details().some(Boolean)).toBe(false);
    code.blur();
    const score = named("college[0].score");
    score.value = "3.5";
    expect(named("college[0].perfectScore").disabled).toBe(true);
    score.focus();
    score.blur();
    expect(named("college[0].perfectScore").disabled).toBe(false);
  });

  it("renders added major rows with disabled details and added parents fully gated", () => {
    mountEducation(1, 1, false, { liveGating: true });
    q<HTMLInputElement>(
      '[name="college[0].degreeTypeCode"][value="50"]',
    ).click();
    q<HTMLButtonElement>(
      '[data-loop="college"] [data-loop="collegeMajor"] button[data-button=add]',
    ).click();
    expect(named("college[0].collegeMajor[1].majorCode").disabled).toBe(false);
    for (const e of all('[data-rel-target="college[0].collegeMajor[1]"]'))
      expect(e.disabled).toBe(true);
    q<HTMLButtonElement>('[data-loopname="college"]').click();
    for (const e of all('[data-rel-target="college[1]"]'))
      expect(e.disabled).toBe(true);
    q<HTMLInputElement>(
      '[name="college[1].degreeTypeCode"][value="40"]',
    ).click();
    for (const e of all('[data-rel-target="college[1]"]'))
      expect(e.disabled).toBe(false);
  });
});
