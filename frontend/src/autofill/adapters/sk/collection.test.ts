import { beforeEach, describe, expect, it } from "vitest";

import { collectPreparationSnapshot } from "../../dom/collect";

function appendRenderedCareerRow(formBody: Element, hasNoSpace = true): void {
  formBody.insertAdjacentHTML(
    "beforeend",
    `
      <div class="form-item-group career-item${hasNoSpace ? " no-space" : ""}">
        <input name="carSeq" type="hidden" />
        <div class="form-item-asset">
          <input name="carCorpName" type="text" />
          <input name="carDeptName" type="text" />
          <input name="carJobRole" type="text" />
          <input name="carPosition" type="text" />
          <input name="carSalary" type="text" />
          <select name="carWorkingYN"><option>재직</option></select>
          <input name="carFromDate" type="tel" />
          <input name="carToDate" type="tel" />
          <textarea name="carDescription"></textarea>
          <textarea name="carRetireDesc"></textarea>
          <div class="form-item-column btn-control">
            <div class="form-add-control column">
              <button class="btn medium btn-dashed btnAddCareer">경력 사항 추가</button>
            </div>
          </div>
        </div>
      </div>
    `,
  );
}

function appendRenderedCertificationRow(
  formBody: Element,
  hasNoSpace = true,
): void {
  formBody.insertAdjacentHTML(
    "beforeend",
    `
      <div class="form-item-group cert-Item${hasNoSpace ? " no-space" : ""}">
        <input name="cerSeq" type="hidden" />
        <div class="form-item-asset">
          <input name="cerCertName" type="text" />
          <input name="cerCertSource" type="text" />
          <input name="cerCertDate" type="tel" />
          <input name="cerCertFilePath" type="hidden" />
          <input name="cerCertFileText" type="hidden" />
          <input name="cerCertFileName" type="text" />
          <input name="cerCertFile" type="file" />
          <div class="form-item-column">
            <div class="form-add-control column">
              <button class="btn medium btn-dashed btnAddCert">자격/면허 추가</button>
            </div>
          </div>
        </div>
      </div>
    `,
  );
}

interface LanguageActionFixture {
  actionId: string;
  actionLabel: string;
  actionClass: string;
  itemClass: string;
  controlColumnClass: string;
  rootId: string;
  rootClass: string;
  templateId: string;
}

function renderedLanguageRow(
  fixture: LanguageActionFixture,
  hasNoSpace = true,
): string {
  return `
    <div class="form-item-group ${fixture.itemClass}${hasNoSpace ? " no-space" : ""}">
      <div class="form-item-asset">
        <div class="${fixture.controlColumnClass}">
          <div class="form-add-control column">
            <button class="btn medium btn-dashed ${fixture.actionClass}">${fixture.actionLabel}</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

const LANGUAGE_ACTION_FIXTURES: readonly LanguageActionFixture[] = [
  {
    actionId: "btnAddLangExam",
    actionLabel: "공인 외국어 시험 추가",
    actionClass: "btnAddLangExam",
    itemClass: "langExam-Item",
    controlColumnClass: "form-item-column",
    rootId: "applyContentLinguistics",
    rootClass: "langExam-root",
    templateId: "LangExam_Item",
  },
  {
    actionId: "btnAddLangAbility",
    actionLabel: "외국어 능력 추가",
    actionClass: "btnAddLangAbility",
    itemClass: "langAbility-item",
    controlColumnClass: "form-item-column btn-control",
    rootId: "applyContentLanguage",
    rootClass: "langAbility-root",
    templateId: "LangAbility_Item",
  },
];

describe("SK collection adapter", () => {
  beforeEach(() => {
    (
      globalThis as unknown as {
        jsdom: { reconfigure(options: { url: string }): void };
      }
    ).jsdom.reconfigure({ url: "https://www.skcareers.com/apply" });
    document.body.replaceChildren();
  });

  it("re-identifies the rendered career action with the initial native ID", () => {
    document.body.innerHTML = `
      <div id="TempleteItems" style="display: none">
        <div id="Career_Item">
          <div class="form-item-group career-item no-space">
            <input name="carCorpName" type="text" />
            <div class="form-add-control column">
              <button class="btn medium btn-dashed btnAddCareer">경력 사항 추가</button>
            </div>
          </div>
        </div>
      </div>
      <div id="container">
        <div id="applyContentProject" class="apply-form-box project-root">
          <div class="form-item-group project-item no-space">
            <div class="form-item-asset">
              <div class="form-item-column btn-control">
                <div class="form-add-control column">
                  <button class="btn medium btn-dashed btnAddCareer">경력 사항 추가</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div id="applyContentCareer" class="apply-form-box career-root">
          <div class="form-body">
            <div class="form-add-control">
              <button id="btnAddCareer" class="btn medium btn-dashed btnAddCareer">경력 사항 추가</button>
            </div>
          </div>
        </div>
      </div>
    `;
    const firstAction =
      document.querySelector<HTMLButtonElement>("#btnAddCareer")!;
    const formBody = document.querySelector(
      "#applyContentCareer > .form-body",
    )!;
    firstAction.addEventListener("click", () => {
      firstAction.style.display = "none";
      appendRenderedCareerRow(formBody);
    });

    const initial = collectPreparationSnapshot(document);
    const initialSection = initial.request.sections.find(
      ({ actionCandidates }) =>
        actionCandidates.some(({ domId }) => domId === "btnAddCareer"),
    )!;
    const initialAction = initialSection.actionCandidates.find(
      ({ domId }) => domId === "btnAddCareer",
    )!;
    expect(initial.countRepeatableGroups(initialAction.candidateId)).toBe(0);

    firstAction.click();
    const refreshed = collectPreparationSnapshot(document);
    const lookup = refreshed.registry.lookupActionByIdentity({
      sectionId: initialSection.sectionId,
      displayName: initialAction.displayName,
      domId: initialAction.domId,
    });

    expect(lookup).toMatchObject({
      status: "ready",
      handle: { candidate: { domId: "btnAddCareer" } },
    });
    expect(
      lookup.status === "ready"
        ? refreshed.countRepeatableGroups(lookup.handle.candidateId)
        : undefined,
    ).toBe(1);
  });

  it("rejects incomplete and ambiguous rendered career actions", () => {
    document.body.innerHTML = `
      <div id="applyContentCareer" class="apply-form-box career-root">
        <div class="form-body">
          <div class="form-add-control column">
            <button class="btn medium btn-dashed btnAddCareer">경력 사항 추가</button>
          </div>
        </div>
      </div>
    `;
    const formBody = document.querySelector(
      "#applyContentCareer > .form-body",
    )!;
    appendRenderedCareerRow(formBody);
    appendRenderedCareerRow(formBody);

    const collected = collectPreparationSnapshot(document);
    const actions = collected.request.sections
      .flatMap(({ actionCandidates }) => actionCandidates)
      .filter(({ displayName }) => displayName === "경력 사항 추가");

    expect(actions.map(({ domId }) => domId)).toEqual([
      undefined,
      "btnAddCareer",
      "btnAddCareer",
    ]);
    expect(
      collected.registry.lookupActionByIdentity({
        sectionId: collected.request.sections[0]!.sectionId,
        displayName: "경력 사항 추가",
        domId: "btnAddCareer",
      }),
    ).toEqual({ status: "unknown" });
  });

  it("re-identifies a later career action without the first-row layout marker", () => {
    document.body.innerHTML = `
      <div id="applyContentOther" class="apply-form-box career-root">
        <div class="form-body"></div>
      </div>
      <div id="applyContentCareer" class="apply-form-box career-root">
        <div class="form-body"></div>
      </div>
    `;
    appendRenderedCareerRow(
      document.querySelector("#applyContentOther > .form-body")!,
      false,
    );
    appendRenderedCareerRow(
      document.querySelector("#applyContentCareer > .form-body")!,
      false,
    );

    const collected = collectPreparationSnapshot(document);
    const actions = collected.request.sections
      .flatMap(({ actionCandidates }) => actionCandidates)
      .filter(({ displayName }) => displayName === "경력 사항 추가");

    expect(actions.map(({ domId }) => domId)).toEqual([
      undefined,
      "btnAddCareer",
    ]);
  });

  it("re-identifies the rendered certification action with the initial native ID", () => {
    document.body.innerHTML = `
      <div id="TempleteItems" style="display: none">
        <div id="Cert_Item">
          <div class="form-item-group cert-Item">
            <input name="cerCertName" type="text" />
            <div class="form-add-control column">
              <button class="btn medium btn-dashed btnAddCert">자격/면허 추가</button>
            </div>
          </div>
        </div>
      </div>
      <div id="container">
        <div id="applyContentProject" class="apply-form-box project-root">
          <div class="form-item-group cert-Item no-space">
            <div class="form-item-asset">
              <div class="form-item-column">
                <div class="form-add-control column">
                  <button class="btn medium btn-dashed btnAddCert">자격/면허 추가</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div id="applyContentLicense" class="apply-form-box cert-root">
          <div class="form-body">
            <div class="form-add-control">
              <button id="btnAddCert" class="btn medium btn-dashed btnAddCert">자격/면허 추가</button>
            </div>
          </div>
        </div>
      </div>
    `;
    const firstAction =
      document.querySelector<HTMLButtonElement>("#btnAddCert")!;
    const formBody = document.querySelector(
      "#applyContentLicense > .form-body",
    )!;
    firstAction.addEventListener("click", () => {
      firstAction.style.display = "none";
      appendRenderedCertificationRow(formBody);
    });

    const initial = collectPreparationSnapshot(document);
    const initialSection = initial.request.sections.find(
      ({ actionCandidates }) =>
        actionCandidates.some(({ domId }) => domId === "btnAddCert"),
    )!;
    const initialAction = initialSection.actionCandidates.find(
      ({ domId }) => domId === "btnAddCert",
    )!;
    expect(initial.countRepeatableGroups(initialAction.candidateId)).toBe(0);

    firstAction.click();
    const refreshed = collectPreparationSnapshot(document);
    const lookup = refreshed.registry.lookupActionByIdentity({
      sectionId: initialSection.sectionId,
      displayName: initialAction.displayName,
      domId: initialAction.domId,
    });

    expect(lookup).toMatchObject({
      status: "ready",
      handle: { candidate: { domId: "btnAddCert" } },
    });
    expect(
      lookup.status === "ready"
        ? refreshed.countRepeatableGroups(lookup.handle.candidateId)
        : undefined,
    ).toBe(1);
  });

  it("rejects incomplete and ambiguous rendered certification actions", () => {
    document.body.innerHTML = `
      <div id="applyContentLicense" class="apply-form-box cert-root">
        <div class="form-body">
          <div class="form-add-control column">
            <button class="btn medium btn-dashed btnAddCert">자격/면허 추가</button>
          </div>
        </div>
      </div>
    `;
    const formBody = document.querySelector(
      "#applyContentLicense > .form-body",
    )!;
    appendRenderedCertificationRow(formBody);
    appendRenderedCertificationRow(formBody);

    const collected = collectPreparationSnapshot(document);
    const actions = collected.request.sections
      .flatMap(({ actionCandidates }) => actionCandidates)
      .filter(({ displayName }) => displayName === "자격/면허 추가");

    expect(actions.map(({ domId }) => domId)).toEqual([
      undefined,
      "btnAddCert",
      "btnAddCert",
    ]);
    expect(
      collected.registry.lookupActionByIdentity({
        sectionId: collected.request.sections[0]!.sectionId,
        displayName: "자격/면허 추가",
        domId: "btnAddCert",
      }),
    ).toEqual({ status: "unknown" });
  });

  it("re-identifies a later certification action without the first-row layout marker", () => {
    document.body.innerHTML = `
      <div id="applyContentOther" class="apply-form-box cert-root">
        <div class="form-body"></div>
      </div>
      <div id="applyContentLicense" class="apply-form-box cert-root">
        <div class="form-body"></div>
      </div>
    `;
    appendRenderedCertificationRow(
      document.querySelector("#applyContentOther > .form-body")!,
      false,
    );
    appendRenderedCertificationRow(
      document.querySelector("#applyContentLicense > .form-body")!,
      false,
    );

    const collected = collectPreparationSnapshot(document);
    const actions = collected.request.sections
      .flatMap(({ actionCandidates }) => actionCandidates)
      .filter(({ displayName }) => displayName === "자격/면허 추가");

    expect(actions.map(({ domId }) => domId)).toEqual([
      undefined,
      "btnAddCert",
    ]);
  });

  it.each(LANGUAGE_ACTION_FIXTURES)(
    "re-identifies $actionId only in its observed SK language structure",
    (fixture) => {
      document.body.innerHTML = `
        <div id="TempleteItems" style="display: none">
          <div id="${fixture.templateId}">
            <div class="form-item-group ${fixture.itemClass}">
              <div class="form-add-control column">
                <button class="btn medium btn-dashed ${fixture.actionClass}">${fixture.actionLabel}</button>
              </div>
            </div>
          </div>
        </div>
        <div id="container">
          <div id="applyContentOther" class="apply-form-box ${fixture.rootClass}">
            <div class="form-body">${renderedLanguageRow(fixture)}</div>
          </div>
          <div id="${fixture.rootId}" class="apply-form-box ${fixture.rootClass}">
            <div class="form-body">
              <div class="form-add-control">
                <button id="${fixture.actionId}" class="btn medium btn-dashed ${fixture.actionClass}">${fixture.actionLabel}</button>
              </div>
            </div>
          </div>
        </div>
      `;
      const firstAction = document.querySelector<HTMLButtonElement>(
        `#${fixture.actionId}`,
      )!;
      const formBody = document.querySelector(
        `#${fixture.rootId} > .form-body`,
      )!;
      firstAction.addEventListener("click", () => {
        firstAction.style.display = "none";
        formBody.insertAdjacentHTML("beforeend", renderedLanguageRow(fixture));
      });

      const initial = collectPreparationSnapshot(document);
      const initialSection = initial.request.sections.find(
        ({ actionCandidates }) =>
          actionCandidates.some(({ domId }) => domId === fixture.actionId),
      )!;
      const initialAction = initialSection.actionCandidates.find(
        ({ domId }) => domId === fixture.actionId,
      )!;
      expect(initial.countRepeatableGroups(initialAction.candidateId)).toBe(0);

      firstAction.click();
      const refreshed = collectPreparationSnapshot(document);
      const lookup = refreshed.registry.lookupActionByIdentity({
        sectionId: initialSection.sectionId,
        displayName: initialAction.displayName,
        domId: initialAction.domId,
      });

      expect(lookup).toMatchObject({
        status: "ready",
        handle: { candidate: { domId: fixture.actionId } },
      });
      expect(
        lookup.status === "ready"
          ? refreshed.countRepeatableGroups(lookup.handle.candidateId)
          : undefined,
      ).toBe(1);
    },
  );

  it.each(LANGUAGE_ACTION_FIXTURES)(
    "re-identifies a later $actionId action without the first-row layout marker",
    (fixture) => {
      document.body.innerHTML = `
        <div id="applyContentOther" class="apply-form-box ${fixture.rootClass}">
          <div class="form-body"></div>
        </div>
        <div id="${fixture.rootId}" class="apply-form-box ${fixture.rootClass}">
          <div class="form-body"></div>
        </div>
      `;
      document
        .querySelector("#applyContentOther > .form-body")!
        .insertAdjacentHTML("beforeend", renderedLanguageRow(fixture, false));
      document
        .querySelector(`#${fixture.rootId} > .form-body`)!
        .insertAdjacentHTML("beforeend", renderedLanguageRow(fixture, false));

      const collected = collectPreparationSnapshot(document);
      const actions = collected.request.sections
        .flatMap(({ actionCandidates }) => actionCandidates)
        .filter(({ displayName }) => displayName === fixture.actionLabel);

      expect(actions.map(({ domId }) => domId)).toEqual([
        undefined,
        fixture.actionId,
      ]);
    },
  );
});
