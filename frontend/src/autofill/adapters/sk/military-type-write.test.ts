import { afterEach, describe, expect, it } from "vitest";

import type { MatchedFieldAnalysis } from "../../api/types";
import { collectFieldsSnapshot } from "../../dom/collect";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { executeApprovedWrites } from "../../write/executor";
import { skWriteAdapter } from "./write";

function setPageUrl(url: string): void {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
}

function collectedHandle(domName = "prsMilitarySvcType"): FieldCandidateHandle {
  const snapshot = collectFieldsSnapshot(document);
  const candidate = snapshot.request.sections
    .flatMap((section) => section.fields)
    .find((field) => field.domName === domName);
  if (!candidate) throw new Error(`Missing candidate ${domName}`);
  const lookup = snapshot.registry.lookupField(candidate.candidateId);
  if (lookup.status !== "ready") throw new Error(`${domName} is unavailable`);
  return lookup.handle;
}

function directItem(
  candidateId: string,
  profileFieldKey: string,
  profileValue: string,
  command: "SELECT_OPTION" | "SET_TEXT" = "SELECT_OPTION",
): ReviewPlanItem {
  const analysis: MatchedFieldAnalysis = {
    candidateId,
    matchType: "MATCH",
    valueBinding: { type: "DIRECT", profileFieldKey },
    autofillPolicy: "CONDITIONAL",
    mappingStatus: "ADAPTER_VERIFIED",
    interactionStatus: "READY",
    writePlan: { command },
  };
  return {
    candidateId,
    fieldLabel: "synthetic SK control",
    currentValue: "",
    profileValue,
    previewValue: profileValue,
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "fixture",
    analysis,
  };
}

function typeItem(candidateId: string): ReviewPlanItem {
  const analysis: MatchedFieldAnalysis = {
    candidateId,
    matchType: "MATCH",
    valueBinding: {
      type: "DIRECT",
      profileFieldKey: "military.military.militaryType",
    },
    autofillPolicy: "CONDITIONAL",
    mappingStatus: "ADAPTER_VERIFIED",
    interactionStatus: "READY",
    writePlan: { command: "SELECT_OPTION" },
  };
  return {
    candidateId,
    fieldLabel: "synthetic military type",
    currentValue: "",
    profileValue: "현역병",
    previewValue: "현역병",
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "fixture",
    analysis,
  };
}

function status(value = "302001"): string {
  return `<select name="prsMilitarySvcStatus"><option value="302001"${value === "302001" ? " selected" : ""}>군필</option><option value="302002"${value === "302002" ? " selected" : ""}>미필</option><option value="302003"${value === "302003" ? " selected" : ""}>면제</option><option value="302004"${value === "302004" ? " selected" : ""}>복무중</option></select>`;
}

function gate(): string {
  return `<label><input type="radio" name="prsMilitarySvcYN" value="0" /> 비대상</label><label><input type="radio" name="prsMilitarySvcYN" value="1" checked /> 대상</label>`;
}

function typeSelect(option = '<option value="303001">현역병</option>'): string {
  return `<select name="prsMilitarySvcType"><option value="" selected>병역구분 *필수항목</option>${option}<option value="303002">상근예비역</option><option value="303003">공익근무요원</option><option value="303004">전문연구요원</option><option value="303005">산업기능요원</option></select>`;
}

function setup(
  markup = `${gate()}${status()}${typeSelect()}`,
  domName = "prsMilitarySvcType",
): FieldCandidateHandle {
  setPageUrl("https://www.skcareers.com/Application/Index/");
  document.body.innerHTML = markup;
  return collectedHandle(domName);
}

afterEach(() => {
  document.body.replaceChildren();
  setPageUrl("http://localhost:3000");
});

describe("SK military type strict writer", () => {
  it("writes the exact live code through the executor once despite its verification repeat", () => {
    const handle = setup();
    const item = typeItem(handle.candidateId);
    const select = document.querySelector<HTMLSelectElement>(
      "select[name='prsMilitarySvcType']",
    )!;
    let inputs = 0;
    let changes = 0;
    select.addEventListener("input", () => inputs++);
    select.addEventListener("change", () => changes++);
    const snapshot = collectFieldsSnapshot(document);

    expect(
      executeApprovedWrites({
        items: [item],
        approvedCandidateIds: new Set([item.candidateId]),
        registry: snapshot.registry,
      }),
    ).toEqual([{ candidateId: item.candidateId, status: "written" }]);
    expect(select.value).toBe("303001");
    expect([inputs, changes]).toEqual([1, 1]);
  });

  it.each([
    ["wrong code", '<option value="303099">현역병</option>'],
    ["wrong label", '<option value="303001">현역 병</option>'],
    [
      "duplicate code",
      '<option value="303001">현역병</option><option value="303001">다른 병역구분</option>',
    ],
    [
      "duplicate label",
      '<option value="303001">현역병</option><option value="303099">현역병</option>',
    ],
  ])("rejects a %s target option", (_reason, option) => {
    const handle = setup(`${gate()}${status()}${typeSelect(option)}`);

    expect(
      skWriteAdapter.tryWrite(handle, typeItem(handle.candidateId)),
    ).toEqual({
      handled: true,
      written: false,
    });
  });

  it("does not write a disabled control or disabled exact option", () => {
    const disabledControl = setup();
    document.querySelector<HTMLSelectElement>(
      "select[name='prsMilitarySvcType']",
    )!.disabled = true;
    expect(
      skWriteAdapter.tryWrite(
        disabledControl,
        typeItem(disabledControl.candidateId),
      ),
    ).toEqual({ handled: true, written: false });

    const disabledOption = setup();
    document.querySelector<HTMLOptionElement>(
      "select[name='prsMilitarySvcType'] option[value='303001']",
    )!.disabled = true;
    expect(
      skWriteAdapter.tryWrite(
        disabledOption,
        typeItem(disabledOption.candidateId),
      ),
    ).toEqual({ handled: true, written: false });
  });

  it("preserves an existing different type without events", () => {
    const handle = setup();
    const select = document.querySelector<HTMLSelectElement>(
      "select[name='prsMilitarySvcType']",
    )!;
    select.value = "303002";
    let events = 0;
    select.addEventListener("change", () => events++);

    expect(
      skWriteAdapter.tryWrite(handle, typeItem(handle.candidateId)),
    ).toEqual({
      handled: true,
      written: false,
    });
    expect(select.value).toBe("303002");
    expect(events).toBe(0);
  });

  it.each(["302002", "302003"])(
    "does not write without a served-or-serving military status (%s)",
    (militaryStatus) => {
      const handle = setup(`${gate()}${status(militaryStatus)}${typeSelect()}`);
      expect(
        skWriteAdapter.tryWrite(handle, typeItem(handle.candidateId)),
      ).toEqual({
        handled: true,
        written: false,
      });
    },
  );

  it("reports failure when a post-event listener reverts the selected type", () => {
    const handle = setup();
    const select = document.querySelector<HTMLSelectElement>(
      "select[name='prsMilitarySvcType']",
    )!;
    select.addEventListener("change", () => {
      select.value = "";
    });

    expect(
      skWriteAdapter.tryWrite(handle, typeItem(handle.candidateId)),
    ).toEqual({
      handled: true,
      written: false,
    });
    expect(select.value).toBe("");
  });

  it("reports failure when a post-event handler changes the selected type code", () => {
    const handle = setup();
    const select = document.querySelector<HTMLSelectElement>(
      "select[name='prsMilitarySvcType']",
    )!;
    select.addEventListener("change", () => {
      select.selectedOptions[0]!.value = "303099";
    });

    expect(
      skWriteAdapter.tryWrite(handle, typeItem(handle.candidateId)),
    ).toEqual({
      handled: true,
      written: false,
    });
  });

  it("reports failure when a post-event handler changes the selected type label", () => {
    const handle = setup();
    const select = document.querySelector<HTMLSelectElement>(
      "select[name='prsMilitarySvcType']",
    )!;
    select.addEventListener("change", () => {
      select.selectedOptions[0]!.textContent = "변경된 병역구분";
    });

    expect(
      skWriteAdapter.tryWrite(handle, typeItem(handle.candidateId)),
    ).toEqual({
      handled: true,
      written: false,
    });
  });

  it.each(["detaches", "disables"])(
    "reports failure when a post-event handler %s the selected control",
    (change) => {
      const handle = setup();
      const select = document.querySelector<HTMLSelectElement>(
        "select[name='prsMilitarySvcType']",
      )!;
      select.addEventListener("change", () => {
        if (change === "detaches") select.remove();
        else select.disabled = true;
      });

      expect(
        skWriteAdapter.tryWrite(handle, typeItem(handle.candidateId)),
      ).toEqual({
        handled: true,
        written: false,
      });
    },
  );

  it("blocks an unverified legacy military rank select from the executor without events", () => {
    const handle = setup(
      '<select name="prsMilitarySvcLevel"><option value="" selected>계급</option><option value="R1">병장</option></select>',
      "prsMilitarySvcLevel",
    );
    const item = directItem(
      handle.candidateId,
      "military.military.militaryRank",
      "병장",
    );
    const select = document.querySelector<HTMLSelectElement>(
      "select[name='prsMilitarySvcLevel']",
    )!;
    let events = 0;
    select.addEventListener("input", () => events++);
    select.addEventListener("change", () => events++);
    const snapshot = collectFieldsSnapshot(document);

    expect(
      executeApprovedWrites({
        items: [item],
        approvedCandidateIds: new Set([item.candidateId]),
        registry: snapshot.registry,
      }),
    ).toEqual([
      {
        candidateId: item.candidateId,
        status: "skipped",
        reason: "네이티브 컨트롤에 안전하게 입력할 수 없습니다.",
      },
    ]);
    expect(select.value).toBe("");
    expect(events).toBe(0);
  });

  it("blocks legacy disability registration text from the executor without events", () => {
    const handle = setup(
      '<input name="prsDisabledNumber" />',
      "prsDisabledNumber",
    );
    const item = directItem(
      handle.candidateId,
      "disability.disability.disabilityRegistrationNumber",
      "synthetic-registration",
      "SET_TEXT",
    );
    const input = document.querySelector<HTMLInputElement>(
      "input[name='prsDisabledNumber']",
    )!;
    let events = 0;
    input.addEventListener("input", () => events++);
    input.addEventListener("change", () => events++);
    const snapshot = collectFieldsSnapshot(document);

    expect(
      executeApprovedWrites({
        items: [item],
        approvedCandidateIds: new Set([item.candidateId]),
        registry: snapshot.registry,
      }),
    ).toEqual([
      {
        candidateId: item.candidateId,
        status: "skipped",
        reason: "네이티브 컨트롤에 안전하게 입력할 수 없습니다.",
      },
    ]);
    expect(input.value).toBe("");
    expect(events).toBe(0);
  });

  it("rejects duplicate same-name controls even when the duplicate is not a select", () => {
    const handle = setup(
      `${gate()}${status()}${typeSelect()}<input name="prsMilitarySvcType" />`,
    );

    expect(
      skWriteAdapter.tryWrite(handle, typeItem(handle.candidateId)),
    ).toEqual({
      handled: true,
      written: false,
    });
  });

  it("rejects the detail when its served status gate has a same-name hidden input", () => {
    const handle = setup(
      `${gate()}${status()}<input type="hidden" name="prsMilitarySvcStatus" value="302001" />${typeSelect()}`,
    );
    const select = document.querySelector<HTMLSelectElement>(
      "select[name='prsMilitarySvcType']",
    )!;
    let events = 0;
    select.addEventListener("input", () => events++);
    select.addEventListener("change", () => events++);

    expect(
      skWriteAdapter.tryWrite(handle, typeItem(handle.candidateId)),
    ).toEqual({
      handled: true,
      written: false,
    });
    expect(select.value).toBe("");
    expect(events).toBe(0);
  });

  it("rejects the detail when its positive military gate has a same-name hidden input", () => {
    const handle = setup(
      `${gate()}<input type="hidden" name="prsMilitarySvcYN" value="1" />${status()}${typeSelect()}`,
    );
    const select = document.querySelector<HTMLSelectElement>(
      "select[name='prsMilitarySvcType']",
    )!;
    let inputs = 0;
    let changes = 0;
    select.addEventListener("input", () => inputs++);
    select.addEventListener("change", () => changes++);

    expect(
      skWriteAdapter.tryWrite(handle, typeItem(handle.candidateId)),
    ).toEqual({
      handled: true,
      written: false,
    });
    expect(select.value).toBe("");
    expect([inputs, changes]).toEqual([0, 0]);
  });
});
