import { beforeEach, describe, expect, it } from "vitest";

import { collectFieldsSnapshot, collectPreparationSnapshot } from "./collect";
import { greetingCollectionAdapter } from "../adapters/greeting/collection";

const UNIVERSITY = "educationalBackground.universities.0";

beforeEach(() => {
  document.body.innerHTML = `
    <section><label>이름<input name="basicInformation.name"></label>
      <div data-scope="field" data-part="root">
        <label>생년월일*</label>
        <button type="button" name="basicInformation.birthdate" data-scope="date-picker" data-part="trigger">날짜 선택</button>
      </div>
    </section>
    <div data-scope="field" data-part="root">
      <label>대학교*</label>
      <div data-scope="accordion" data-part="root">
        <div data-scope="accordion" data-part="item">
          <div data-scope="field" data-part="root"><label>학교명*</label>
            <input name="${UNIVERSITY}.schoolName" role="combobox" placeholder="검색">
          </div>
          <div data-scope="field" data-part="root"><label>입학일*</label>
            <button type="button" name="${UNIVERSITY}.enrollmentPeriod.startDate" data-scope="date-picker" data-part="trigger">입학일</button>
          </div>
          <div data-scope="field" data-part="root"><label>학위구분*</label>
            <div data-scope="toggle-group" data-part="root" role="radiogroup">
              <button type="button" role="radio" data-scope="toggle-group" data-part="item" aria-checked="false">전문학사</button>
              <button type="button" role="radio" data-scope="toggle-group" data-part="item" aria-checked="false">학사</button>
            </div>
          </div>
        </div>
      </div>
      <button type="button" data-scope="tooltip" data-part="trigger">항목 추가</button>
    </div>`;
});

describe("Greeting collection is enabled only by the server adapter ID", () => {
  it("emits one root section when a Greeting form has no repeatable actions", () => {
    document.body.innerHTML = `<div data-scope="field" data-part="root"><label>이름</label><input name="basicInformation.name"></div>`;

    const snapshot = collectPreparationSnapshot(document, {
      executionAdapterId: "greeting-v1",
    });

    expect(
      snapshot.request.sections.map((section) => section.sectionId),
    ).toEqual(["section-root"]);
    expect(snapshot.request.sections[0]?.actionCandidates).toEqual([]);
  });

  it("keeps populated custom values out of field and preparation payloads", () => {
    const birthdate = document.querySelector<HTMLButtonElement>(
      'button[name="basicInformation.birthdate"]',
    )!;
    birthdate.textContent = "1990. 01. 02";
    birthdate.setAttribute("aria-label", "1990. 01. 02 선택");
    const start = document.querySelector<HTMLButtonElement>(
      `button[name="${UNIVERSITY}.enrollmentPeriod.startDate"]`,
    )!;
    start.textContent = "2020. 03";
    start.setAttribute("aria-label", "졸업예정 2020. 03");
    document.querySelector<HTMLInputElement>(
      `input[name="${UNIVERSITY}.schoolName"]`,
    )!.value = "개인학교값";
    document.body.insertAdjacentHTML(
      "beforeend",
      '<button type="button">1990년 1월 2일</button>',
    );
    document.body.insertAdjacentHTML(
      "beforeend",
      `
      <div data-scope="field" data-part="root"><label>이메일 주소</label>
        <input role="combobox" data-scope="combobox" data-part="input" aria-controls="email-options" value="private@example.com">
      </div>
      <div id="email-options" role="listbox"><div role="option">private@example.com</div></div>`,
    );

    const fields = collectFieldsSnapshot(document, {
      executionAdapterId: "greeting-v1",
    });
    const candidates = fields.request.sections.flatMap((section) => [
      ...section.fields,
      ...(section.items ?? []).flatMap((item) => item.fields),
    ]);
    const birth = candidates.find(
      (field) => field.domName === "basicInformation.birthdate",
    );
    expect(birth?.displayName).toBe("생년월일");
    expect(birth?.semanticContext?.labels).toEqual([
      { source: "label", text: "생년월일" },
    ]);
    expect(
      candidates.find(
        (field) => field.domName === `${UNIVERSITY}.enrollmentPeriod.startDate`,
      )?.semanticContext?.labels,
    ).toEqual([{ source: "label", text: "입학일" }]);
    const preparation = collectPreparationSnapshot(document, {
      executionAdapterId: "greeting-v1",
    });
    expect(
      preparation.request.sections
        .flatMap((section) => section.actionCandidates)
        .map((action) => action.domId),
    ).toEqual(["greeting:add:universities"]);
    for (const request of [fields.request, preparation.request]) {
      const payload = JSON.stringify(request);
      for (const value of [
        "1990",
        "2020",
        "개인학교값",
        "졸업예정",
        "private@example.com",
      ])
        expect(payload).not.toContain(value);
    }
  });

  it("keeps live fields inside Greeting gridTemplateAreas utility classes", () => {
    const school = document.querySelector<HTMLInputElement>(
      `input[name="${UNIVERSITY}.schoolName"]`,
    )!;
    school
      .closest('[data-scope="field"]')!
      .classList.add("gridTemplateAreas-greetil7meg");
    school.insertAdjacentHTML(
      "afterend",
      `<input name="${UNIVERSITY}.gpa.score" class="gridTemplateAreas-greetil7meg">`,
    );
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div class="application-template"><input name="template-hidden-field"></div>',
    );

    const snapshot = collectFieldsSnapshot(document, {
      executionAdapterId: "greeting-v1",
    });
    const names = snapshot.request.sections.flatMap((section) => [
      ...section.fields.map((field) => field.domName),
      ...(section.items ?? []).flatMap((item) =>
        item.fields.map((field) => field.domName),
      ),
    ]);
    expect(names).toContain(`${UNIVERSITY}.schoolName`);
    expect(names).toContain(`${UNIVERSITY}.gpa.score`);
    expect(names).not.toContain("template-hidden-field");
  });

  it("collects verified custom controls and education rows by named identity", () => {
    const fields = collectFieldsSnapshot(document, {
      executionAdapterId: "greeting-v1",
    });
    const candidates = fields.request.sections.flatMap((section) => [
      ...section.fields,
      ...(section.items ?? []).flatMap((item) => item.fields),
    ]);
    expect(candidates.map((field) => field.domName)).toEqual(
      expect.arrayContaining([
        "basicInformation.name",
        "basicInformation.birthdate",
        `${UNIVERSITY}.schoolName`,
        `${UNIVERSITY}.enrollmentPeriod.startDate`,
        `${UNIVERSITY}.degreeLevel`,
      ]),
    );
    const education = fields.request.sections.find((section) =>
      section.items?.some((item) => item.itemGroupId === "educationuniversity"),
    );
    expect(education?.items).toHaveLength(1);
    expect(education?.items?.[0]?.fields.map((field) => field.domName)).toEqual(
      expect.arrayContaining([
        `${UNIVERSITY}.schoolName`,
        `${UNIVERSITY}.enrollmentPeriod.startDate`,
        `${UNIVERSITY}.degreeLevel`,
      ]),
    );
    expect(
      education?.items?.[0]?.fields.find(
        (field) => field.domName === `${UNIVERSITY}.schoolName`,
      )?.semanticContext?.repeat,
    ).toMatchObject({
      groupId: "educationuniversity",
      rowIndex: 0,
      rowCount: 1,
    });
    for (const candidate of candidates) {
      expect(fields.registry.lookupField(candidate.candidateId).status).toBe(
        "ready",
      );
    }
    const preparation = collectPreparationSnapshot(document, {
      executionAdapterId: "greeting-v1",
    });
    const add = preparation.request.sections
      .flatMap((section) => section.actionCandidates)
      .find((candidate) => candidate.domId === "greeting:add:universities");
    expect(add).toBeDefined();
    expect(preparation.countRepeatableGroups(add!.candidateId)).toBe(1);
  });

  it("does not infer Greeting controls without an explicit adapter ID", () => {
    const fields = collectFieldsSnapshot(document);
    const candidates = fields.request.sections.flatMap((section) => [
      ...section.fields,
      ...(section.items ?? []).flatMap((item) => item.fields),
    ]);
    expect(
      candidates.some(
        (field) => field.domName === "basicInformation.birthdate",
      ),
    ).toBe(false);
    expect(
      candidates.some((field) => field.domName === `${UNIVERSITY}.degreeLevel`),
    ).toBe(false);
  });

  it("keeps university and graduate school rows and add counts separate", () => {
    document
      .querySelector('[data-scope="accordion"][data-part="root"]')!
      .insertAdjacentHTML(
        "beforeend",
        `<div data-scope="accordion" data-part="item">
          <div data-scope="field" data-part="root"><label>학교명*</label>
            <input name="educationalBackground.universities.1.schoolName" role="combobox" placeholder="검색">
          </div>
        </div>`,
      );
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div data-scope="field" data-part="root">
        <label>대학원*</label>
        <div data-scope="accordion" data-part="root">
          <div data-scope="accordion" data-part="item">
            <div data-scope="field" data-part="root"><label>학교명*</label>
              <input name="educationalBackground.graduateSchools.0.schoolName" role="combobox" placeholder="검색">
            </div>
          </div>
        </div>
        <button type="button" data-scope="tooltip" data-part="trigger">항목 추가</button>
      </div>`,
    );

    const fields = collectFieldsSnapshot(document, {
      executionAdapterId: "greeting-v1",
    });
    const rows = fields.request.sections.flatMap(
      (section) => section.items ?? [],
    );
    expect(rows.map((row) => row.itemGroupId)).toEqual([
      "educationuniversity",
      "educationuniversity",
      "educationgraduateschool",
    ]);
    expect(
      rows[1]?.fields.find((field) => field.domName?.endsWith("schoolName"))
        ?.semanticContext?.repeat,
    ).toMatchObject({
      groupId: "educationuniversity",
      rowIndex: 1,
      rowCount: 2,
    });
    const preparation = collectPreparationSnapshot(document, {
      executionAdapterId: "greeting-v1",
    });
    const actions = preparation.request.sections.flatMap(
      (section) => section.actionCandidates,
    );
    const universityAdd = actions.find(
      (candidate) => candidate.domId === "greeting:add:universities",
    );
    const graduateAdd = actions.find(
      (candidate) => candidate.domId === "greeting:add:graduateSchools",
    );
    expect(
      universityAdd &&
        preparation.countRepeatableGroups(universityAdd.candidateId),
    ).toBe(2);
    expect(
      graduateAdd && preparation.countRepeatableGroups(graduateAdd.candidateId),
    ).toBe(1);
  });

  it("keeps the target row current while a school popup hides sibling rows from accessibility", () => {
    const root = document.querySelector(
      '[data-scope="accordion"][data-part="root"]',
    )!;
    root.insertAdjacentHTML(
      "beforeend",
      '<div data-scope="accordion" data-part="item"><input name="educationalBackground.universities.1.schoolName" role="combobox"></div>',
    );
    const snapshot = collectFieldsSnapshot(document, {
      executionAdapterId: "greeting-v1",
    });
    const school = snapshot.request.sections
      .flatMap((section) => section.items ?? [])
      .flatMap((item) => item.fields)
      .find((field) => field.domName === `${UNIVERSITY}.schoolName`)!;
    const lookup = snapshot.registry.lookupField(school.candidateId);
    expect(lookup.status).toBe("ready");
    if (lookup.status !== "ready") return;
    expect(lookup.handle.isCurrentContext?.()).toBe(true);

    const sibling = root.querySelectorAll(
      '[data-scope="accordion"][data-part="item"]',
    )[1]!;
    sibling.setAttribute("aria-hidden", "true");
    expect(lookup.handle.isCurrentContext?.()).toBe(true);

    sibling.remove();
    expect(lookup.handle.isCurrentContext?.()).toBe(false);
  });

  it("counts a graduate school's major rows through its verified add action", () => {
    const prefix = "educationalBackground.graduateSchools.0";
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div data-scope="field" data-part="root"><label>대학원*</label>
        <div data-scope="accordion" data-part="root"><div data-scope="accordion" data-part="item">
          <input name="${prefix}.schoolName">
          <div data-scope="field" data-part="root"><label>전공*</label>
            <button name="${prefix}.majors.0.majorClassification">주전공</button>
            <button name="${prefix}.majors.0.majorField">공학계열</button>
            <input name="${prefix}.majors.0" role="combobox">
            <button type="button" data-scope="tooltip" data-part="trigger">전공 추가</button>
          </div>
        </div></div><button data-scope="tooltip" data-part="trigger">항목 추가</button>
      </div>`,
    );
    const firstAdd = [
      ...document.querySelectorAll<HTMLButtonElement>(
        'button[data-scope="tooltip"][data-part="trigger"]',
      ),
    ].find((button) => button.textContent === "전공 추가")!;
    expect(greetingCollectionAdapter.actionDomId(firstAdd)).toBe(
      "greeting:add:graduateSchools:0:majors",
    );
    const first = collectPreparationSnapshot(document, {
      executionAdapterId: "greeting-v1",
    });
    const major = first.request.sections
      .flatMap((section) => section.actionCandidates)
      .find(
        (action) => action.domId === "greeting:add:graduateSchools:0:majors",
      );
    expect(major).toBeDefined();
    expect(first.countRepeatableGroups(major!.candidateId)).toBe(1);
    const oldPrefix = "educationalBackground.graduateSchools.0";
    const changedPrefix = "educationalBackground.graduateSchools.1";
    for (const control of document.querySelectorAll<HTMLElement>(
      `[name^="${oldPrefix}."]`,
    )) {
      control.setAttribute(
        "name",
        control.getAttribute("name")!.replace(oldPrefix, changedPrefix),
      );
    }
    expect(first.countRepeatableGroups(major!.candidateId)).toBeUndefined();
    for (const control of document.querySelectorAll<HTMLElement>(
      `[name^="${changedPrefix}."]`,
    )) {
      control.setAttribute(
        "name",
        control.getAttribute("name")!.replace(changedPrefix, oldPrefix),
      );
    }
    const add = [
      ...document.querySelectorAll<HTMLButtonElement>(
        'button[data-scope="tooltip"][data-part="trigger"]',
      ),
    ].find((button) => button.textContent === "전공 추가")!;
    add.insertAdjacentHTML(
      "beforebegin",
      `<button name="${prefix}.majors.1.majorClassification">복수전공</button><button name="${prefix}.majors.1.majorField">사회계열</button><input name="${prefix}.majors.1" role="combobox">`,
    );
    const second = collectPreparationSnapshot(document, {
      executionAdapterId: "greeting-v1",
    });
    const secondMajor = second.request.sections
      .flatMap((section) => section.actionCandidates)
      .find(
        (action) => action.domId === "greeting:add:graduateSchools:0:majors",
      );
    expect(secondMajor).toBeDefined();
    expect(second.countRepeatableGroups(secondMajor!.candidateId)).toBe(2);
  });
});
