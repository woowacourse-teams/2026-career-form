import { beforeEach, describe, expect, it } from "vitest";

import type { PreparationPlan } from "../../api/types";
import { collectPreparationSnapshot } from "../../dom/collect";
import {
  executeApprovedPreparationPlans,
  type PreparationSnapshot,
} from "../../preparation/executor";

const CAREER_ACTION_LABEL = "경력 사항 추가";

type CareerOutcome = "one" | "none" | "two" | "vanish";

function careerFields(rowIndex: number): string {
  const uuid = (digit: number) =>
    `${digit}${rowIndex}111111-1111-4111-8111-111111111111`;
  return `
    <input type="hidden" name="carSeq" />
    <input type="text" name="carCorpName" id="carCorpName_${uuid(1)}" />
    <input type="text" name="carDeptName" id="carDeptName_${uuid(2)}" />
    <input type="text" name="carJobRole" id="carJobRole_${uuid(3)}" />
    <input type="text" name="carPosition" id="carPosition_${uuid(4)}" />
    <input type="text" name="carSalary" id="carSalary_${uuid(5)}" />
    <select name="carWorkingYN"><option>재직</option></select>
    <input type="tel" name="carFromDate" id="carFromDate_${uuid(6)}" />
    <input type="tel" name="carToDate" id="carToDate_${uuid(7)}" />
    <textarea name="carDescription" id="carDescription_${uuid(8)}"></textarea>
    <textarea name="carRetireDesc" id="carRetireDesc_${uuid(9)}"></textarea>
  `;
}

function careerAddControl(id?: string): string {
  return `
    <div class="form-item-asset">
      <div class="form-item-column btn-control">
        <div class="form-add-control column">
          <button${id ? ` id="${id}"` : ""} class="btn medium btn-dashed btnAddCareer" type="button">${CAREER_ACTION_LABEL}</button>
        </div>
      </div>
    </div>
  `;
}

function careerRow(
  rowIndex: number,
  isFirstRow: boolean,
  withAction = true,
): HTMLDivElement {
  const row = document.createElement("div");
  row.className = `form-item-group career-item${isFirstRow ? " no-space" : ""}`;
  row.innerHTML = `${careerFields(rowIndex)}${withAction ? careerAddControl() : ""}`;
  return row;
}

function preparationPlan(): PreparationPlan {
  const initial = collectPreparationSnapshot(document);
  const actionCandidateId = initial.request.sections
    .flatMap((section) => section.actionCandidates)
    .find(
      (candidate) =>
        candidate.domId === "btnAddCareer" ||
        candidate.displayName === CAREER_ACTION_LABEL,
    )?.candidateId;
  if (!actionCandidateId) throw new Error("missing verified SK career action");
  return {
    actionCandidateId,
    command: "ADD_REPEATABLE_GROUP",
    expectedEffect: "GROUP_COUNT_INCREMENT",
  };
}

function snapshot(): PreparationSnapshot {
  const collected = collectPreparationSnapshot(document);
  return {
    registry: collected.registry,
    isTargetSectionVisible: collected.isSectionVisible,
    countRepeatableGroups: (plan) =>
      collected.countRepeatableGroups(plan.actionCandidateId),
  };
}

function setupCareerForm() {
  document.body.innerHTML = `
    <div id="applyContentCareer" class="apply-form-box career-root">
      <div class="form-body">
        <div class="form-add-control"><button id="btnAddCareer" class="btn medium btn-dashed btnAddCareer" type="button">${CAREER_ACTION_LABEL}</button></div>
      </div>
    </div>
    <div id="container">
      <div id="TempleteItems" style="display: none">
        <div id="Career_Item" style="display: block">
          <div class="form-item-group career-item">${careerFields(0)}${careerAddControl()}</div>
        </div>
      </div>
    </div>
  `;
  const formBody = document.querySelector<HTMLDivElement>(
    "#applyContentCareer .form-body",
  )!;
  const original = document.querySelector<HTMLButtonElement>("#btnAddCareer")!;
  const careerClicks: HTMLButtonElement[] = [];
  let nextRowIndex = 1;
  let generatedRowCount = 0;
  const attach = (action: HTMLButtonElement, outcome: CareerOutcome) => {
    action.addEventListener("click", () => {
      careerClicks.push(action);
      if (outcome !== "none") action.style.display = "none";
      if (outcome === "vanish") return;
      const additions = outcome === "two" ? 2 : outcome === "none" ? 0 : 1;
      for (let index = 0; index < additions; index += 1) {
        const row = careerRow(
          nextRowIndex++,
          generatedRowCount === 0,
          outcome !== "two" || index === 1,
        );
        generatedRowCount += 1;
        formBody.append(row);
        const next = row.querySelector<HTMLButtonElement>(".btnAddCareer");
        if (next) attach(next, outcome);
      }
    });
  };
  attach(original, "one");

  return {
    careerClicks,
    formBody,
    original,
    attach,
    claimRowIndex: () => nextRowIndex++,
    markFirstCareerRowGenerated: () => {
      generatedRowCount = 1;
    },
  };
}

async function runCareerPreparation(
  localItemCount: number,
  count = (
    current: PreparationSnapshot,
    plan: Extract<PreparationPlan, { command: "ADD_REPEATABLE_GROUP" }>,
  ) => current.countRepeatableGroups?.(plan) ?? Number.NaN,
) {
  const plan = preparationPlan();
  return executeApprovedPreparationPlans({
    approvedPlans: [{ plan, approved: true, localItemCount }],
    initialSnapshot: snapshot(),
    refreshSnapshot: async () => snapshot(),
    countRepeatableGroups: count,
  });
}

function certificateFields(): string {
  return `
    <input type="text" name="cerCertName" />
    <input type="text" name="cerCertSource" />
    <input type="tel" name="cerCertDate" />
    <input type="hidden" name="cerSeq" />
    <input type="hidden" name="cerCertFilePath" />
    <input type="hidden" name="cerCertFileText" />
    <input type="text" name="cerCertFileName" />
    <input type="file" name="cerCertFile" />
  `;
}

function certificateAddControl(): string {
  return `
    <div class="form-item-asset">
      <div class="form-item-column">
        <div class="form-add-control column">
          <button class="btn medium btn-dashed btnAddCert" type="button">자격/면허 추가</button>
        </div>
      </div>
    </div>
  `;
}

function certificateRow(isFirstRow: boolean): HTMLDivElement {
  const row = document.createElement("div");
  row.className = `form-item-group cert-Item${isFirstRow ? " no-space" : ""}`;
  row.innerHTML = `${certificateFields()}${certificateAddControl()}`;
  return row;
}

function certificatePlan(): PreparationPlan {
  const initial = collectPreparationSnapshot(document);
  const actionCandidateId = initial.request.sections
    .flatMap((section) => section.actionCandidates)
    .find((candidate) => candidate.domId === "btnAddCert")?.candidateId;
  if (!actionCandidateId)
    throw new Error("missing verified SK certificate action");
  return {
    actionCandidateId,
    command: "ADD_REPEATABLE_GROUP",
    expectedEffect: "GROUP_COUNT_INCREMENT",
  };
}

function certificateSnapshot(): PreparationSnapshot {
  const collected = collectPreparationSnapshot(document);
  return {
    registry: collected.registry,
    isTargetSectionVisible: collected.isSectionVisible,
    countRepeatableGroups: (plan) =>
      collected.countRepeatableGroups(plan.actionCandidateId),
  };
}

function setupCertificateForm() {
  document.body.innerHTML = `
    <div id="applyContentLicense" class="apply-form-box cert-root">
      <div class="form-body">
        <div class="form-add-control"><button id="btnAddCert" class="btn medium btn-dashed btnAddCert" type="button">자격/면허 추가</button></div>
      </div>
    </div>
    <div id="TempleteItems" style="display: none">
      <div id="Cert_Item">
        <div class="form-item-group cert-Item">${certificateFields()}${certificateAddControl()}</div>
      </div>
    </div>
  `;
  const formBody = document.querySelector<HTMLDivElement>(
    "#applyContentLicense .form-body",
  )!;
  const original = document.querySelector<HTMLButtonElement>("#btnAddCert")!;
  const certificateClicks: HTMLButtonElement[] = [];
  let rowCount = 0;
  const attach = (action: HTMLButtonElement) => {
    action.addEventListener("click", () => {
      certificateClicks.push(action);
      action.style.display = "none";
      const row = certificateRow(rowCount === 0);
      rowCount += 1;
      formBody.append(row);
      attach(row.querySelector("button")!);
    });
  };
  attach(original);
  return { certificateClicks, formBody };
}

async function runCertificatePreparation(localItemCount: number) {
  const plan = certificatePlan();
  return executeApprovedPreparationPlans({
    approvedPlans: [{ plan, approved: true, localItemCount }],
    initialSnapshot: certificateSnapshot(),
    refreshSnapshot: async () => certificateSnapshot(),
    countRepeatableGroups: (current, currentPlan) =>
      current.countRepeatableGroups?.(currentPlan) ?? Number.NaN,
  });
}

function languageExamFields(): string {
  return `
    <input type="hidden" name="lngSeq" />
    <input type="hidden" name="lngExamType" />
    <select name="lngLanguageType"><option>영어</option></select>
    <input type="text" name="lngExamName" />
    <input type="text" name="lngExamScore" />
    <select name="lngExamScoreSel"><option>점수</option></select>
    <input type="tel" name="lngScoreDate" />
    <input type="hidden" name="lngCertFilePath" />
    <input type="hidden" name="lngCertFileText" />
    <input type="text" name="lngCertFileName" />
    <input type="file" name="lngCertFile" />
  `;
}

function languageExamAddControl(): string {
  return `
    <div class="form-item-asset">
      <div class="form-item-column">
        <div class="form-add-control column">
          <button class="btn medium btn-dashed btnAddLangExam" type="button">공인 외국어 시험 추가</button>
        </div>
      </div>
    </div>
  `;
}

function languageExamRow(isFirstRow: boolean): HTMLDivElement {
  const row = document.createElement("div");
  row.className = `form-item-group langExam-Item${isFirstRow ? " no-space" : ""}`;
  row.innerHTML = `${languageExamFields()}${languageExamAddControl()}`;
  return row;
}

function languageAbilityFields(): string {
  return `
    <input type="hidden" name="lngabSeq" />
    <select name="lngabLanguageType"><option>영어</option></select>
    <select name="lngabConversation"><option>상</option></select>
    <select name="lngabWriting"><option>상</option></select>
    <select name="lngabReading"><option>상</option></select>
  `;
}

function languageAbilityAddControl(): string {
  return `
    <div class="form-item-asset">
      <div class="form-item-column btn-control">
        <div class="form-add-control column">
          <button class="btn medium btn-dashed btnAddLangAbility" type="button">외국어 능력 추가</button>
        </div>
      </div>
    </div>
  `;
}

function languageAbilityRow(isFirstRow: boolean): HTMLDivElement {
  const row = document.createElement("div");
  row.className = `form-item-group langAbility-item${isFirstRow ? " no-space" : ""}`;
  row.innerHTML = `${languageAbilityFields()}${languageAbilityAddControl()}`;
  return row;
}

function setupLanguageRepeatForm(options: {
  actionId: string;
  actionClass: string;
  actionLabel: string;
  rootId: string;
  rootClass: string;
  rowSelector: string;
  templateId: string;
  templateRowClass: string;
  fields: () => string;
  addControl: () => string;
  createRow: (isFirstRow: boolean) => HTMLDivElement;
}) {
  document.body.innerHTML = `
    <div id="${options.rootId}" class="apply-form-box ${options.rootClass}">
      <div class="form-body">
        <div class="form-add-control"><button id="${options.actionId}" class="btn medium btn-dashed ${options.actionClass}" type="button">${options.actionLabel}</button></div>
      </div>
    </div>
    <div id="TempleteItems" style="display: none">
      <div id="${options.templateId}">
        <div class="form-item-group ${options.templateRowClass}">${options.fields()}${options.addControl()}</div>
      </div>
    </div>
  `;
  const formBody = document.querySelector<HTMLDivElement>(
    `#${options.rootId} .form-body`,
  )!;
  const original = document.querySelector<HTMLButtonElement>(
    `#${options.actionId}`,
  )!;
  const clicks: HTMLButtonElement[] = [];
  let rowCount = 0;
  const attach = (action: HTMLButtonElement) => {
    action.addEventListener("click", () => {
      clicks.push(action);
      action.style.display = "none";
      const row = options.createRow(rowCount === 0);
      rowCount += 1;
      formBody.append(row);
      attach(row.querySelector("button")!);
    });
  };
  attach(original);
  return { clicks, formBody };
}

async function runLanguagePreparation(options: {
  actionId: string;
  rootId: string;
  rowSelector: string;
  localItemCount?: number;
}) {
  const initial = collectPreparationSnapshot(document);
  const actionCandidateId = initial.request.sections
    .flatMap((section) => section.actionCandidates)
    .find((candidate) => candidate.domId === options.actionId)?.candidateId;
  if (!actionCandidateId)
    throw new Error("missing verified SK language action");
  const plan: PreparationPlan = {
    actionCandidateId,
    command: "ADD_REPEATABLE_GROUP",
    expectedEffect: "GROUP_COUNT_INCREMENT",
  };
  const nextSnapshot = (): PreparationSnapshot => {
    const collected = collectPreparationSnapshot(document);
    return {
      registry: collected.registry,
      isTargetSectionVisible: collected.isSectionVisible,
      countRepeatableGroups: (currentPlan) =>
        collected.countRepeatableGroups(currentPlan.actionCandidateId),
    };
  };
  return executeApprovedPreparationPlans({
    approvedPlans: [
      { plan, approved: true, localItemCount: options.localItemCount ?? 1 },
    ],
    initialSnapshot: nextSnapshot(),
    refreshSnapshot: async () => nextSnapshot(),
    countRepeatableGroups: (current, currentPlan) =>
      current.countRepeatableGroups?.(currentPlan) ?? Number.NaN,
  });
}

describe("SK career repeat preparation", () => {
  beforeEach(() => {
    (
      globalThis as unknown as {
        jsdom: { reconfigure(options: { url: string }): void };
      }
    ).jsdom.reconfigure({
      url: "https://www.skcareers.com/apply",
    });
    document.body.replaceChildren();
  });

  it("adds the first visible SK career row after the id-bearing action is replaced", async () => {
    const { careerClicks } = setupCareerForm();

    const result = await runCareerPreparation(1);

    expect(careerClicks).toHaveLength(1);
    expect(
      document.querySelectorAll("#applyContentCareer .career-item"),
    ).toHaveLength(1);
    expect(result).toMatchObject({
      status: "completed",
      executedPlanCount: 1,
      mayCollectFieldsSnapshot: true,
    });
  });

  it.each([
    [2, 1],
    [3, 2],
  ])(
    "adds only %i rows from one visible career row",
    async (localItemCount, clicks) => {
      const {
        careerClicks,
        formBody,
        original,
        attach,
        claimRowIndex,
        markFirstCareerRowGenerated,
      } = setupCareerForm();
      original.remove();
      const existing = careerRow(claimRowIndex(), true);
      formBody.append(existing);
      markFirstCareerRowGenerated();
      attach(existing.querySelector("button")!, "one");

      const result = await runCareerPreparation(localItemCount);

      expect(careerClicks).toHaveLength(clicks);
      expect(formBody.querySelectorAll(".career-item")).toHaveLength(
        localItemCount,
      );
      expect(result).toMatchObject({
        status: "completed",
        executedPlanCount: clicks,
        mayCollectFieldsSnapshot: true,
      });
    },
  );

  it("does not use an identical career label in another form section", async () => {
    const { careerClicks, formBody } = setupCareerForm();
    const otherRoot = document.createElement("div");
    otherRoot.className = "apply-form-box other-root";
    otherRoot.innerHTML = `<div class="form-body">${careerAddControl()}</div>`;
    document.body.append(otherRoot);
    let otherClicks = 0;
    otherRoot.querySelector("button")!.addEventListener("click", () => {
      otherClicks += 1;
    });

    const result = await runCareerPreparation(2);

    expect(careerClicks).toHaveLength(2);
    expect(formBody.querySelectorAll(".career-item")).toHaveLength(2);
    expect(otherClicks).toBe(0);
    expect(result).toMatchObject({ status: "completed" });
  });

  it("does not click when the visible career rows already satisfy the profile", async () => {
    const { careerClicks, formBody } = setupCareerForm();
    formBody.append(careerRow(1, true));

    const result = await runCareerPreparation(1);

    expect(careerClicks).toHaveLength(0);
    expect(result).toMatchObject({
      status: "completed",
      executedPlanCount: 0,
      mayCollectFieldsSnapshot: true,
    });
  });

  it("blocks field collection when the verified career action disappears", async () => {
    const { original } = setupCareerForm();
    const detach = original.cloneNode(true) as HTMLButtonElement;
    original.replaceWith(detach);
    detach.addEventListener("click", () => detach.remove());

    const result = await runCareerPreparation(1);

    expect(result).toMatchObject({
      status: "failed",
      reason: "action-not-reidentified",
      mayCollectFieldsSnapshot: false,
    });
  });

  it.each([
    ["cannot determine the career row count", "invalid-group-count", "unknown"],
    ["adds no career row", "group-count-not-incremented", "none"],
    ["adds two career rows", "group-count-not-incremented", "two"],
  ] as const)(
    "blocks field collection when preparation %s",
    async (_description, reason, outcome) => {
      const setup = setupCareerForm();
      if (outcome !== "unknown") {
        const replacement = setup.original.cloneNode(true) as HTMLButtonElement;
        setup.original.replaceWith(replacement);
        setup.attach(replacement, outcome);
      }

      const result =
        outcome === "unknown"
          ? await runCareerPreparation(1, () => Number.NaN)
          : await runCareerPreparation(1);

      expect(result).toMatchObject({
        status: "failed",
        reason,
        mayCollectFieldsSnapshot: false,
      });
    },
  );
});

describe("SK certificate repeat preparation", () => {
  beforeEach(() => {
    (
      globalThis as unknown as {
        jsdom: { reconfigure(options: { url: string }): void };
      }
    ).jsdom.reconfigure({
      url: "https://www.skcareers.com/apply",
    });
    document.body.replaceChildren();
  });

  it("adds three certificate rows through replacement add actions without using another section", async () => {
    const { certificateClicks, formBody } = setupCertificateForm();
    const otherRoot = document.createElement("div");
    otherRoot.className = "apply-form-box other-root";
    otherRoot.innerHTML = `<div class="form-body">${certificateAddControl()}</div>`;
    document.body.append(otherRoot);
    let otherClicks = 0;
    otherRoot.querySelector("button")!.addEventListener("click", () => {
      otherClicks += 1;
    });

    const result = await runCertificatePreparation(3);

    expect(certificateClicks).toHaveLength(3);
    expect(formBody.querySelectorAll(".cert-Item")).toHaveLength(3);
    expect(otherClicks).toBe(0);
    expect(result).toMatchObject({
      status: "completed",
      executedPlanCount: 3,
      mayCollectFieldsSnapshot: true,
    });
  });
});

describe("SK language repeat preparation", () => {
  beforeEach(() => {
    (
      globalThis as unknown as {
        jsdom: { reconfigure(options: { url: string }): void };
      }
    ).jsdom.reconfigure({
      url: "https://www.skcareers.com/apply",
    });
    document.body.replaceChildren();
  });

  it("adds the first language exam row after the id-bearing action is replaced", async () => {
    const { clicks, formBody } = setupLanguageRepeatForm({
      actionId: "btnAddLangExam",
      actionClass: "btnAddLangExam",
      actionLabel: "공인 외국어 시험 추가",
      rootId: "applyContentLinguistics",
      rootClass: "langExam-root",
      rowSelector: ".form-item-group.langExam-Item",
      templateId: "LangExam_Item",
      templateRowClass: "langExam-Item",
      fields: languageExamFields,
      addControl: languageExamAddControl,
      createRow: languageExamRow,
    });

    const result = await runLanguagePreparation({
      actionId: "btnAddLangExam",
      rootId: "applyContentLinguistics",
      rowSelector: ".form-item-group.langExam-Item",
    });

    expect(clicks).toHaveLength(1);
    expect(formBody.querySelectorAll(".langExam-Item")).toHaveLength(1);
    expect(result).toMatchObject({
      status: "completed",
      executedPlanCount: 1,
      mayCollectFieldsSnapshot: true,
    });
  });

  it("adds the first language ability row after the id-bearing action is replaced", async () => {
    const { clicks, formBody } = setupLanguageRepeatForm({
      actionId: "btnAddLangAbility",
      actionClass: "btnAddLangAbility",
      actionLabel: "외국어 능력 추가",
      rootId: "applyContentLanguage",
      rootClass: "langAbility-root",
      rowSelector: ".form-item-group.langAbility-item",
      templateId: "LangAbility_Item",
      templateRowClass: "langAbility-item",
      fields: languageAbilityFields,
      addControl: languageAbilityAddControl,
      createRow: languageAbilityRow,
    });

    const result = await runLanguagePreparation({
      actionId: "btnAddLangAbility",
      rootId: "applyContentLanguage",
      rowSelector: ".form-item-group.langAbility-item",
    });

    expect(clicks).toHaveLength(1);
    expect(formBody.querySelectorAll(".langAbility-item")).toHaveLength(1);
    expect(result).toMatchObject({
      status: "completed",
      executedPlanCount: 1,
      mayCollectFieldsSnapshot: true,
    });
  });

  it("adds two language exam rows when only the first replacement row has no-space", async () => {
    const { clicks, formBody } = setupLanguageRepeatForm({
      actionId: "btnAddLangExam",
      actionClass: "btnAddLangExam",
      actionLabel: "공인 외국어 시험 추가",
      rootId: "applyContentLinguistics",
      rootClass: "langExam-root",
      rowSelector: ".form-item-group.langExam-Item",
      templateId: "LangExam_Item",
      templateRowClass: "langExam-Item",
      fields: languageExamFields,
      addControl: languageExamAddControl,
      createRow: languageExamRow,
    });

    const result = await runLanguagePreparation({
      actionId: "btnAddLangExam",
      rootId: "applyContentLinguistics",
      rowSelector: ".form-item-group.langExam-Item",
      localItemCount: 2,
    });

    expect(clicks).toHaveLength(2);
    expect(formBody.querySelectorAll(".langExam-Item")).toHaveLength(2);
    expect(result).toMatchObject({
      status: "completed",
      executedPlanCount: 2,
      mayCollectFieldsSnapshot: true,
    });
  });

  it("adds two language ability rows when only the first replacement row has no-space", async () => {
    const { clicks, formBody } = setupLanguageRepeatForm({
      actionId: "btnAddLangAbility",
      actionClass: "btnAddLangAbility",
      actionLabel: "외국어 능력 추가",
      rootId: "applyContentLanguage",
      rootClass: "langAbility-root",
      rowSelector: ".form-item-group.langAbility-item",
      templateId: "LangAbility_Item",
      templateRowClass: "langAbility-item",
      fields: languageAbilityFields,
      addControl: languageAbilityAddControl,
      createRow: languageAbilityRow,
    });

    const result = await runLanguagePreparation({
      actionId: "btnAddLangAbility",
      rootId: "applyContentLanguage",
      rowSelector: ".form-item-group.langAbility-item",
      localItemCount: 2,
    });

    expect(clicks).toHaveLength(2);
    expect(formBody.querySelectorAll(".langAbility-item")).toHaveLength(2);
    expect(result).toMatchObject({
      status: "completed",
      executedPlanCount: 2,
      mayCollectFieldsSnapshot: true,
    });
  });
});
