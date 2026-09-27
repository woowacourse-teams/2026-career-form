import { beforeEach, describe, expect, it } from "vitest";
import {
  greetingCollectionAdapter,
  greetingRowIdentity,
  greetingFieldElements,
  greetingSectionContainer,
  greetingRadioGroupDomName,
  greetingSyntheticDomName,
  greetingMajorRowsForAction,
} from "./collection";

function row(kind: string, index: number, extra = ""): string {
  const prefix = `educationalBackground.${kind}.${index}`;
  return `<div data-scope="accordion" data-part="item" id="random-${kind}-${index}">
    <input name="${prefix}.schoolName" />
    <input name="${prefix}.gpa.score" />
    <input name="${prefix}.majors.0" />
    <button name="${prefix}.enrollmentPeriod.startDate">입학</button>${extra}
  </div>`;
}

function toggle(label: string, options: string[], nested = false): string {
  return `<div data-scope="field" data-part="root"><label>${label}</label>${nested ? '<div data-scope="field" data-part="root">' : ""}<div data-scope="toggle-group" data-part="root" role="radiogroup">${options.map((option) => `<button data-scope="toggle-group" data-part="item" role="radio">${option}</button>`).join("")}</div>${nested ? "</div>" : ""}</div>`;
}

describe("Greeting collection", () => {
  it("orders verified repeated rows by named index and rejects a gap", () => {
    document.body.innerHTML = `<div data-scope="accordion" data-part="root">${row("universities", 1)}${row("universities", 0)}</div>`;
    const container = document.body.firstElementChild!;
    expect(
      greetingCollectionAdapter
        .repeatableItemCandidates(container)
        ?.map((row) => greetingRowIdentity(row)?.index),
    ).toEqual([0, 1]);
    container.innerHTML = row("universities", 0) + row("universities", 2);
    expect(
      greetingCollectionAdapter.repeatableItemCandidates(container),
    ).toEqual([]);
  });

  it("rejects duplicate named inputs within a row", () => {
    document.body.innerHTML = row(
      "universities",
      0,
      '<input name="educationalBackground.universities.0.gpa.score" />',
    );
    expect(
      greetingRowIdentity(document.body.firstElementChild!),
    ).toBeUndefined();
  });

  it("recognizes only the exact education section add action across zero and multiple rows", () => {
    document.body.innerHTML = `<div data-scope="field" data-part="root"><label data-scope="field" data-part="label">대학교*</label><div data-scope="accordion" data-part="root"></div><button data-scope="tooltip" data-part="trigger">항목 추가</button></div><div data-scope="field" data-part="root"><label>대학원*</label><div data-scope="accordion" data-part="root">${row("graduateSchools", 0)}</div><button data-scope="tooltip" data-part="trigger">항목 추가</button></div>`;
    const buttons = [
      ...document.querySelectorAll<HTMLButtonElement>('[data-scope="tooltip"]'),
    ];
    expect(
      buttons.map((button) => greetingCollectionAdapter.actionDomId(button)),
    ).toEqual(["greeting:add:universities", "greeting:add:graduateSchools"]);
    document.querySelector(
      '[data-part="root"] [data-scope="accordion"]',
    )!.innerHTML = row("universities", 0) + row("universities", 1);
    expect(greetingCollectionAdapter.actionDomId(buttons[0]!)).toBe(
      "greeting:add:universities",
    );
  });

  it("rejects ambiguous, cross-kind, and major-add actions", () => {
    document.body.innerHTML = `<div data-scope="field" data-part="root"><label>대학교*</label><div data-scope="accordion" data-part="root">${row("graduateSchools", 0)}</div><button data-scope="tooltip" data-part="trigger">항목 추가</button></div><div data-scope="field" data-part="root"><label>대학원*</label><button data-scope="tooltip" data-part="trigger">항목 추가</button><button data-scope="tooltip" data-part="trigger">항목 추가</button></div><div data-scope="field" data-part="root"><label>전공*</label><button data-scope="tooltip" data-part="trigger">전공 추가</button></div>`;
    expect(
      [
        ...document.querySelectorAll<HTMLButtonElement>(
          '[data-scope="tooltip"]',
        ),
      ].map((button) => greetingCollectionAdapter.actionDomId(button)),
    ).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("identifies a graduate row's exact major add action and contiguous complete major rows", () => {
    const prefix = "educationalBackground.graduateSchools.0";
    document.body.innerHTML = `<div data-scope="accordion" data-part="item">
      <input name="${prefix}.schoolName">
      <div data-scope="field" data-part="root"><label>전공*</label>
        <button name="${prefix}.majors.0.majorClassification">주전공</button>
        <button name="${prefix}.majors.0.majorField">공학계열</button>
        <input name="${prefix}.majors.0" role="combobox">
        <button type="button" data-scope="tooltip" data-part="trigger">전공 추가</button>
      </div></div>`;
    const add = document.querySelector<HTMLButtonElement>(
      'button[data-scope="tooltip"]',
    )!;
    expect(greetingCollectionAdapter.actionDomId(add)).toBe(
      "greeting:add:graduateSchools:0:majors",
    );
    expect(greetingMajorRowsForAction(add)).toHaveLength(1);
    add.insertAdjacentHTML(
      "beforebegin",
      `<button name="${prefix}.majors.1.majorClassification">복수전공</button><button name="${prefix}.majors.1.majorField">사회계열</button><input name="${prefix}.majors.1" role="combobox">`,
    );
    expect(greetingMajorRowsForAction(add)).toHaveLength(2);
    document.querySelector(`[name="${prefix}.majors.1.majorField"]`)!.remove();
    expect(greetingCollectionAdapter.actionDomId(add)).toBeUndefined();
  });

  it("rejects identical add actions in two matching education sections", () => {
    const section =
      '<div data-scope="field" data-part="root"><label>대학교*</label><button data-scope="tooltip" data-part="trigger">항목 추가</button></div>';
    document.body.innerHTML = section + section;
    expect(
      [...document.querySelectorAll<HTMLButtonElement>("button")].map(
        (button) => greetingCollectionAdapter.actionDomId(button),
      ),
    ).toEqual([undefined, undefined]);
  });

  it("groups a nested school input and its add button in the same bounded education section", () => {
    document.body.innerHTML = `<div data-scope="field" data-part="root"><label>대학교*</label><div data-scope="accordion" data-part="root">${row("universities", 0)}</div><button data-scope="tooltip" data-part="trigger">항목 추가</button></div><div data-scope="field" data-part="root"><label>이메일</label><input type="email" /></div>`;
    const section = document.body.firstElementChild!;
    expect(greetingSectionContainer(section.querySelector("input")!)).toBe(
      section,
    );
    expect(
      greetingSectionContainer(
        section.querySelector('[data-scope="tooltip"]')!,
      ),
    ).toBe(section);
    expect(
      greetingSectionContainer(document.querySelector('[type="email"]')!),
    ).toBeUndefined();
    expect(
      greetingCollectionAdapter
        .repeatableItemCandidates(section)
        ?.map((row) => greetingRowIdentity(row)?.prefix),
    ).toEqual(["educationalBackground.universities.0"]);
  });

  it("collects unique birthdate and military buttons only under their exact owned labels", () => {
    document.body.innerHTML = `<div data-scope="field" data-part="root"><label>생년월일*</label><button name="basicInformation.birthdate">선택</button></div><div data-scope="field" data-part="root"><label>병역사항*</label><button name="militaryServicePreferentialEmploymentStatus.militaryService.militaryServiceStatus">선택</button></div>`;
    expect(
      greetingFieldElements(document).map((element) =>
        element.getAttribute("name"),
      ),
    ).toEqual([
      "basicInformation.birthdate",
      "militaryServicePreferentialEmploymentStatus.militaryService.militaryServiceStatus",
    ]);
    document.querySelector("label")!.textContent = "입사일";
    expect(
      greetingFieldElements(document).map((element) =>
        element.getAttribute("name"),
      ),
    ).toEqual([
      "militaryServicePreferentialEmploymentStatus.militaryService.militaryServiceStatus",
    ]);
    document.body.insertAdjacentHTML(
      "beforeend",
      '<button name="militaryServicePreferentialEmploymentStatus.militaryService.militaryServiceStatus">중복</button>',
    );
    expect(greetingFieldElements(document)).toEqual([]);
  });

  it("collects conditional military and disability controls only under their exact labels", () => {
    const prefix = "militaryServicePreferentialEmploymentStatus";
    const controls = [
      ["군별", `${prefix}.militaryService.branchOfService`],
      ["계급", `${prefix}.militaryService.rank`],
      ["복무기간", `${prefix}.militaryService.servicePeriod.startDate`],
      ["복무기간", `${prefix}.militaryService.servicePeriod.endDate`],
      ["장애정도", `${prefix}.disability.degreeOfDisability`],
      ["장애내용", `${prefix}.disability.descriptionOfDisability`],
    ];
    document.body.innerHTML = controls
      .map(
        ([label, name]) =>
          `<div data-scope="field" data-part="root"><label>${label}*</label><button name="${name}">선택</button></div>`,
      )
      .join("");
    expect(
      greetingFieldElements(document).map((element) =>
        element.getAttribute("name"),
      ),
    ).toEqual(controls.map(([, name]) => name));
    document.querySelector("label")!.textContent = "군종";
    expect(
      greetingFieldElements(document).map((element) =>
        element.getAttribute("name"),
      ),
    ).toEqual(controls.slice(1).map(([, name]) => name));
  });

  it("recognizes an exact conditional label around an unlabeled inner field", () => {
    const name =
      "militaryServicePreferentialEmploymentStatus.disability.descriptionOfDisability";
    document.body.innerHTML = `<div data-scope="field" data-part="root"><label>장애내용*</label><div data-scope="field" data-part="root"><button name="${name}">선택</button></div></div>`;
    expect(
      greetingFieldElements(document).map((element) =>
        element.getAttribute("name"),
      ),
    ).toEqual([name]);
  });

  it("derives stable status names through unlabeled inner field roots", () => {
    document.body.innerHTML =
      toggle("장애여부*", ["비대상", "대상"], true) +
      toggle("보훈여부*", ["비대상", "대상"], true);
    expect(
      [...document.querySelectorAll('[role="radiogroup"]')].map(
        greetingRadioGroupDomName,
      ),
    ).toEqual([
      "militaryServicePreferentialEmploymentStatus.disability.disabilityStatus",
      "militaryServicePreferentialEmploymentStatus.veteran.veteranStatus",
    ]);
  });

  it("ties degree, admission, and attendance to verified row names", () => {
    document.body.innerHTML =
      row(
        "universities",
        1,
        toggle("학위구분*", ["전문학사", "학사"]) +
          toggle("입학구분*", ["입학", "편입"]) +
          toggle("주/야간 구분*", ["주간", "야간"]),
      ) +
      row(
        "graduateSchools",
        0,
        toggle("입학구분*", ["입학", "편입"]) +
          toggle("주/야간 구분*", ["주간", "야간"]),
      );
    expect(
      [...document.querySelectorAll('[role="radiogroup"]')].map(
        greetingRadioGroupDomName,
      ),
    ).toEqual([
      "educationalBackground.universities.1.degreeLevel",
      "educationalBackground.universities.1.admissionType",
      "educationalBackground.universities.1.attendanceType",
      "educationalBackground.graduateSchools.0.admissionType",
      "educationalBackground.graduateSchools.0.attendanceType",
    ]);
  });

  it("omits unknown, duplicate, or mismatched radio contexts", () => {
    document.body.innerHTML =
      toggle("입학구분*", ["입학", "편입"]) +
      toggle("장애여부*", ["예", "아니오"]) +
      toggle("보훈여부*", ["비대상", "대상"]) +
      toggle("보훈여부*", ["비대상", "대상"]) +
      row("graduateSchools", 0, toggle("학위구분*", ["전문학사", "학사"])) +
      row("universities", 0, toggle("장애여부*", ["비대상", "대상"]));
    expect(
      [...document.querySelectorAll('[role="radiogroup"]')].map(
        greetingRadioGroupDomName,
      ),
    ).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(
      greetingFieldElements(document).filter((element) =>
        element.matches('[role="radiogroup"]'),
      ),
    ).toEqual([]);
  });

  it("gives the unique unnamed email combobox a synthetic name without modifying the DOM", () => {
    document.body.innerHTML =
      '<div data-scope="field" data-part="root"><label>이메일주소*</label><input role="combobox" data-scope="combobox" data-part="input" id="dynamic-email" /></div>';
    const input = document.querySelector("input")!;
    expect(greetingSyntheticDomName(input)).toBe("basicInformation.email");
    expect(input.hasAttribute("name")).toBe(false);
    input.setAttribute("name", "other");
    expect(greetingSyntheticDomName(input)).toBeUndefined();
    input.removeAttribute("name");
    document.querySelector("label")!.textContent = "학교명";
    expect(greetingSyntheticDomName(input)).toBeUndefined();
  });

  it("recognizes the short email label on a unique unnamed Greeting combobox", () => {
    document.body.innerHTML =
      '<div data-scope="field" data-part="root"><label>이메일*</label><input role="combobox" data-scope="combobox" data-part="input" /></div>';

    expect(greetingSyntheticDomName(document.querySelector("input")!)).toBe(
      "basicInformation.email",
    );
  });

  it("rejects duplicate email comboboxes and supports verified radio identities through the shared helper", () => {
    const email =
      '<div data-scope="field" data-part="root"><label>이메일주소*</label><input role="combobox" data-scope="combobox" data-part="input" /></div>';
    const shortEmail =
      '<div data-scope="field" data-part="root"><label>이메일*</label><input role="combobox" data-scope="combobox" data-part="input" /></div>';
    document.body.innerHTML =
      email + shortEmail + toggle("장애여부*", ["비대상", "대상"]);
    expect(
      [...document.querySelectorAll("input")].map(greetingSyntheticDomName),
    ).toEqual([undefined, undefined]);
    expect(
      greetingSyntheticDomName(document.querySelector('[role="radiogroup"]')!),
    ).toBe(
      "militaryServicePreferentialEmploymentStatus.disability.disabilityStatus",
    );
  });

  beforeEach(() => document.body.replaceChildren());

  it("identifies university and graduate rows from descendant field names regardless of DOM order", () => {
    document.body.innerHTML =
      row("graduateSchools", 1) + row("universities", 0);
    const rows = [...document.querySelectorAll('[data-part="item"]')];
    expect(rows.map(greetingRowIdentity)).toEqual([
      {
        itemGroupId: "educationgraduateschool",
        index: 1,
        prefix: "educationalBackground.graduateSchools.1",
      },
      {
        itemGroupId: "educationuniversity",
        index: 0,
        prefix: "educationalBackground.universities.0",
      },
    ]);
    expect(greetingCollectionAdapter.itemGroupId?.(rows[0]!)).toBe(
      "educationgraduateschool",
    );
  });

  it("rejects mixed row prefixes and duplicate school controls", () => {
    document.body.innerHTML =
      row(
        "universities",
        0,
        '<input name="educationalBackground.graduateSchools.0.schoolName" />',
      ) +
      row(
        "universities",
        1,
        '<input name="educationalBackground.universities.1.schoolName" />',
      );
    expect(
      [...document.querySelectorAll('[data-part="item"]')].map(
        greetingRowIdentity,
      ),
    ).toEqual([undefined, undefined]);
  });

  it("rejects duplicate row indexes within a repeatable container", () => {
    document.body.innerHTML = `<div data-scope="accordion" data-part="root">${row("universities", 0)}${row("universities", 0)}</div>`;
    expect(
      greetingCollectionAdapter.repeatableItemCandidates(
        document.body.firstElementChild!,
      ),
    ).toEqual([]);
  });

  it("collects only verified named date/select buttons and labeled toggle groups", () => {
    document.body.innerHTML =
      row(
        "universities",
        0,
        `
      <button name="educationalBackground.universities.0.completionStatus">졸업</button>
      <button name="educationalBackground.universities.0.delete">삭제</button>
    `,
      ) +
      `<div data-scope="field" data-part="root"><label>장애여부*</label>
      <div data-scope="toggle-group" data-part="root" role="radiogroup">
      <button data-scope="toggle-group" data-part="item" role="radio" id="dynamic-item-INELIGIBLE">비대상</button><button data-scope="toggle-group" data-part="item" role="radio" id="dynamic-item-ELIGIBLE">대상</button>
      </div></div><button name="submit">지원</button>`;
    expect(
      greetingFieldElements(document).map(
        (element) =>
          element.getAttribute("name") ?? element.getAttribute("role"),
      ),
    ).toEqual([
      "educationalBackground.universities.0.enrollmentPeriod.startDate",
      "educationalBackground.universities.0.completionStatus",
      "radiogroup",
    ]);
  });

  it("does not collect named education buttons outside their verified row or unlabeled toggle groups", () => {
    document.body.innerHTML =
      '<button name="educationalBackground.universities.0.completionStatus">졸업</button><div data-scope="toggle-group" data-part="root" role="radiogroup"><button data-scope="toggle-group" data-part="item" role="radio">군필</button></div>';
    expect(greetingFieldElements(document)).toEqual([]);
  });
});
