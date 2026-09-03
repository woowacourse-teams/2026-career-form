import { beforeEach, describe, expect, it } from "vitest";

import { collectFieldsSnapshot, collectPreparationSnapshot } from "./collect";

describe("application form DOM collection", () => {
  beforeEach(() => {
    document.title = "지원서";
    history.replaceState({}, "", "/apply/123?token=private#contact");
    document.body.innerHTML = "";
  });

  it("separates action and field snapshots without serializing private values", () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>연락처</legend>
        <label for="email">이메일</label>
        <input id="email" name="email" value="private@example.test" />
        <button type="button">저장</button>
        <button type="button">항목 추가</button>
      </fieldset>
    `;

    const fields = collectFieldsSnapshot(document);
    const preparation = collectPreparationSnapshot(document);
    const serializedFields = JSON.stringify(fields.request);

    expect(serializedFields).not.toContain("private@example.test");
    expect(serializedFields).not.toContain("token=private");
    expect(serializedFields).not.toContain("#contact");
    expect(fields.request.site).toEqual({
      host: "localhost:3000",
      pathPattern: "/apply/*",
    });
    expect(fields.request.sections[0]?.fields).toHaveLength(1);
    expect(preparation.request.sections[0]?.actionCandidates).toHaveLength(1);
    expect(
      preparation.request.sections[0]?.actionCandidates[0]?.displayName,
    ).toBe("항목 추가");
    expect(JSON.stringify(preparation.request)).not.toContain("email");
  });

  it("collects a same-name radio group as one candidate with display-only options", () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>개인 정보</legend>
        <label><input type="radio" name="gender" value="internal-m" checked /> 남성</label>
        <label><input type="radio" name="gender" value="internal-f" /> 여성</label>
      </fieldset>
    `;

    const collected = collectFieldsSnapshot(document);
    const candidate = collected.request.sections[0]?.fields[0];

    expect(collected.request.sections[0]?.fields).toHaveLength(1);
    expect(candidate).toMatchObject({ control: "radio", domName: "gender" });
    expect(candidate?.options).toEqual([
      { optionId: expect.any(String), displayName: "남성" },
      { optionId: expect.any(String), displayName: "여성" },
    ]);
    expect(JSON.stringify(collected.request)).not.toContain("internal-m");
    expect(JSON.stringify(collected.request)).not.toContain("checked");
  });

  it("preserves repeated certification row boundaries and local indexes", () => {
    document.body.innerHTML = `
      <div class="apply-form-box">
        <h3>자격/면허</h3>
        <div class="form-body">
          <div class="form-item-group cert-Item">
            <label for="field-67">자격증명</label>
            <input id="field-67" name="certificateName" />
            <label for="field-68">발급기관</label>
            <input id="field-68" name="certificateIssuer" />
          </div>
          <div class="form-item-group cert-Item">
            <label for="field-71">자격증명</label>
            <input id="field-71" name="certificateName" />
            <label for="field-72">발급기관</label>
            <input id="field-72" name="certificateIssuer" />
          </div>
        </div>
      </div>
    `;

    const collected = collectFieldsSnapshot(document);
    const section = collected.request.sections[0]!;

    expect(section.fields).toEqual([]);
    expect(section.items).toHaveLength(2);
    expect(
      section.items?.map((item) => item.fields.map(({ domId }) => domId)),
    ).toEqual([
      ["field-67", "field-68"],
      ["field-71", "field-72"],
    ]);

    const firstCandidateId = section.items![0]!.fields[0]!.candidateId;
    const secondCandidateId = section.items![1]!.fields[0]!.candidateId;
    expect(collected.registry.lookupField(firstCandidateId)).toMatchObject({
      status: "ready",
      handle: { itemId: expect.any(String), itemIndex: 0 },
    });
    expect(collected.registry.lookupField(secondCandidateId)).toMatchObject({
      status: "ready",
      handle: { itemId: expect.any(String), itemIndex: 1 },
    });
    expect(collected.registry.fieldItemCount(firstCandidateId)).toBe(2);
  });

  it("indexes different repeated field groups independently within one section", () => {
    document.body.innerHTML = `
      <div class="apply-form-box education-root">
        <div class="form-item-group educationhigh-item">
          <input id="high-school" name="highSchoolName" />
        </div>
        <div class="form-item-group educationUniv-item">
          <input id="university" name="universityName" />
        </div>
      </div>
    `;

    const collected = collectFieldsSnapshot(document);
    const items = collected.request.sections[0]!.items!;
    const highSchoolCandidateId = items[0]!.fields[0]!.candidateId;
    const universityCandidateId = items[1]!.fields[0]!.candidateId;

    expect(
      [highSchoolCandidateId, universityCandidateId].map((candidateId) =>
        collected.registry.lookupField(candidateId),
      ),
    ).toEqual([
      expect.objectContaining({
        handle: expect.objectContaining({ itemIndex: 0 }),
        status: "ready",
      }),
      expect.objectContaining({
        handle: expect.objectContaining({ itemIndex: 0 }),
        status: "ready",
      }),
    ]);
    expect(collected.registry.fieldItemCount(highSchoolCandidateId)).toBe(1);
    expect(collected.registry.fieldItemCount(universityCandidateId)).toBe(1);
  });

  it("invalidates all repeated candidates when a row disappears after collection", () => {
    document.body.innerHTML = `
      <section>
        <div class="cert-Item"><input id="first" /></div>
        <div class="cert-Item"><input id="middle" /></div>
        <div class="cert-Item"><input id="last" /></div>
      </section>
    `;

    const collected = collectFieldsSnapshot(document);
    const section = collected.request.sections[0]!;
    const lastCandidateId = section.items![2]!.fields[0]!.candidateId;
    document.querySelector("#middle")!.parentElement!.remove();

    expect(collected.registry.lookupField(lastCandidateId).status).toBe(
      "stale",
    );
  });

  it("excludes CSS-hidden template rows from field and item collection", () => {
    document.head.innerHTML = `<style>#TempleteItems { display: none; }</style>`;
    document.body.innerHTML = `
      <div class="apply-form-box">
        <div class="cert-Item"><input id="visible-certificate" /></div>
      </div>
      <div id="TempleteItems">
        <div class="cert-Item"><input id="template-certificate" /></div>
      </div>
    `;

    const collected = collectFieldsSnapshot(document);
    const serialized = JSON.stringify(collected.request);

    expect(serialized).toContain("visible-certificate");
    expect(serialized).not.toContain("template-certificate");
    expect(collected.request.sections).toHaveLength(1);
    expect(collected.request.sections[0]?.items).toHaveLength(1);
  });

  it("marks removed or structurally changed live candidates as stale", () => {
    document.body.innerHTML = `<label for="name">이름</label><input id="name" />`;
    const collected = collectFieldsSnapshot(document);
    const candidateId = collected.request.sections[0]!.fields[0]!.candidateId;
    const input = document.querySelector("input")!;

    expect(collected.registry.lookupField(candidateId).status).toBe("ready");
    input.remove();
    expect(collected.registry.lookupField(candidateId).status).toBe("stale");
  });

  it("counts nested repeatable items in a form body without counting inner form items", () => {
    document.body.innerHTML = `
      <div class="apply-form-box cert-root">
        <div class="form-title"><h3>자격/면허</h3></div>
        <div class="form-body">
          <div class="form-item-group">
            <div class="form-item"><button type="button">자격/면허 추가</button></div>
          </div>
          <div class="form-item-group cert-Item">
            <div class="form-item"><input name="cerCertName" /></div>
          </div>
        </div>
      </div>
    `;

    const collected = collectPreparationSnapshot(document);
    const action = collected.request.sections
      .flatMap(({ actionCandidates }) => actionCandidates)
      .find(({ displayName }) => displayName === "자격/면허 추가");

    expect(action).toBeDefined();
    expect(collected.countRepeatableGroups(action!.candidateId)).toBe(1);
    expect(collected.request.sections[0]?.items).toBeUndefined();
  });

  it("does not treat upload or delete controls as preparation actions", () => {
    document.body.innerHTML = `
      <section>
        <button type="button">파일 업로드</button>
        <button type="button">삭제</button>
        <button type="button">학점 변환 계산기</button>
        <button type="button">자격/면허 추가</button>
      </section>
    `;

    const collected = collectPreparationSnapshot(document);

    expect(
      collected.request.sections[0]?.actionCandidates.map(
        ({ displayName }) => displayName,
      ),
    ).toEqual(["자격/면허 추가"]);
  });

  it("caps long field metadata at the analysis API limit", () => {
    document.body.innerHTML = `
      <label for="long-select">${"가".repeat(200)}</label>
      <select id="long-select">
        <option>선택</option>
      </select>
    `;

    const collected = collectFieldsSnapshot(document);
    const field = collected.request.sections[0]!.fields[0]!;

    expect(field.displayName).toHaveLength(120);
  });

  it("caps preparation select options to the analysis API contract", () => {
    document.body.innerHTML = `
      <label for="job-role">직무 선택</label>
      <select id="job-role" name="jobRole">
        ${Array.from(
          { length: 129 },
          (_, index) => `<option>${`${index}-`.repeat(61)}</option>`,
        ).join("")}
      </select>
    `;

    const collected = collectPreparationSnapshot(document);
    const action = collected.request.sections[0]!.actionCandidates[0]!;

    expect(action.options).toHaveLength(128);
    expect(action.options?.[0]?.displayName).toHaveLength(120);
  });

  it("counts different repeatable groups independently within one section", () => {
    document.body.innerHTML = `
      <div class="apply-form-box education-root">
        <div class="form-item-group educationhigh-item"></div>
        <div class="form-item-group educationUniv-item"></div>
        <div class="form-item-group educationGrad-item"></div>
        <button class="btnAddEducationHigh" type="button">고등학교 학력 정보 추가</button>
        <button class="btnAddEducationUniv" type="button">대학 학력 정보 추가</button>
        <button class="btnAddEducationGrad" type="button">대학원 학력 정보 추가</button>
      </div>
    `;

    const collected = collectPreparationSnapshot(document);
    const actions = collected.request.sections[0]!.actionCandidates;

    expect(
      actions.map((action) =>
        collected.countRepeatableGroups(action.candidateId),
      ),
    ).toEqual([1, 1, 1]);
  });

  it("does not count a sibling education row for an empty education group", () => {
    document.body.innerHTML = `
      <div class="apply-form-box education-root">
        <div class="form-item-group educationhigh-item"></div>
        <button class="btnAddEducationHigh" type="button">고등학교 학력 정보 추가</button>
        <button class="btnAddEducationUniv" type="button">대학 학력 정보 추가</button>
      </div>
    `;

    const collected = collectPreparationSnapshot(document);
    const actions = collected.request.sections[0]!.actionCandidates;

    expect(
      actions.map((action) =>
        collected.countRepeatableGroups(action.candidateId),
      ),
    ).toEqual([1, 0]);
  });

  it("keeps disabled, readonly, hidden, password and file controls non-executable", () => {
    document.body.innerHTML = `
      <input aria-label="disabled" disabled />
      <input aria-label="readonly" readonly />
      <input aria-label="hidden" hidden />
      <input aria-label="password" type="password" />
      <input aria-label="file" type="file" />
    `;

    const collected = collectFieldsSnapshot(document);
    const fields = collected.request.sections[0]!.fields;

    expect(fields.map(({ displayName }) => displayName)).toEqual([
      "disabled",
      "readonly",
      "hidden",
    ]);
    expect(
      fields.map(({ candidateId }) =>
        collected.registry.lookupField(candidateId),
      ),
    ).toEqual([
      expect.objectContaining({ status: "blocked", reason: "disabled" }),
      expect.objectContaining({ status: "blocked", reason: "readonly" }),
      expect.objectContaining({ status: "blocked", reason: "hidden" }),
    ]);
  });
});
