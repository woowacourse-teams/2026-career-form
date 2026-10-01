import { afterEach, describe, expect, it } from "vitest";

import type { MatchedFieldAnalysis } from "../../api/types";
import { collectFieldsSnapshot } from "../../dom/collect";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { skWriteAdapter } from "./write";

function setPageUrl(url: string): void {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
}

function item(
  analysis: MatchedFieldAnalysis,
  profileValue: string,
): ReviewPlanItem {
  return {
    candidateId: analysis.candidateId,
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

function analysis(
  candidateId: string,
  valueBinding: MatchedFieldAnalysis["valueBinding"],
  writePlan: NonNullable<MatchedFieldAnalysis["writePlan"]>,
): MatchedFieldAnalysis {
  return {
    candidateId,
    matchType: "MATCH",
    valueBinding,
    autofillPolicy: "CONDITIONAL",
    mappingStatus: "ADAPTER_VERIFIED",
    interactionStatus: "READY",
    writePlan,
  };
}

function collectedHandle(domName: string): FieldCandidateHandle {
  const snapshot = collectFieldsSnapshot(document);
  const candidate = snapshot.request.sections
    .flatMap((section) => section.fields)
    .find((field) => field.domName === domName);
  if (!candidate) throw new Error(`Missing candidate ${domName}`);
  const lookup = snapshot.registry.lookupField(candidate.candidateId);
  if (lookup.status !== "ready") throw new Error(`Unavailable ${domName}`);
  return lookup.handle;
}

function militaryGate(): string {
  return `<label><input type="radio" name="prsMilitarySvcYN" value="0" /> 비대상</label><label><input type="radio" name="prsMilitarySvcYN" value="1" /> 대상</label>`;
}

afterEach(() => {
  document.body.replaceChildren();
  setPageUrl("http://localhost:3000");
});

describe("SK protected writer", () => {
  it("checks the positive target from the collected whole status group using the derived radio contract", () => {
    setPageUrl("https://www.skcareers.com/Application/Index/");
    document.body.innerHTML = militaryGate();
    const handle = collectedHandle("prsMilitarySvcYN");
    const result = skWriteAdapter.tryWrite(
      handle,
      item(
        analysis(
          handle.candidateId,
          {
            type: "LOOKUP",
            profileFieldKey: "military.military.militaryStatus",
            optionMap: { 군필: "대상" },
          },
          { command: "CHECK_RADIO" },
        ),
        "대상",
      ),
    );

    expect(result).toEqual({ handled: true, written: true });
    expect(
      document.querySelector<HTMLInputElement>(
        "input[name='prsMilitarySvcYN'][value='1']",
      )?.checked,
    ).toBe(true);
  });

  it("preserves an opposite status choice and emits no event", () => {
    setPageUrl("https://www.skcareers.com/Application/Index/");
    document.body.innerHTML = militaryGate();
    const negative = document.querySelector<HTMLInputElement>(
      "input[name='prsMilitarySvcYN'][value='0']",
    )!;
    negative.checked = true;
    let changes = 0;
    negative.addEventListener("change", () => changes++);
    const handle = collectedHandle("prsMilitarySvcYN");

    expect(
      skWriteAdapter.tryWrite(
        handle,
        item(
          analysis(
            handle.candidateId,
            {
              type: "LOOKUP",
              profileFieldKey: "military.military.militaryStatus",
              optionMap: { 군필: "대상" },
            },
            { command: "CHECK_RADIO" },
          ),
          "대상",
        ),
      ),
    ).toEqual({ handled: true, written: false });
    expect(negative.checked).toBe(true);
    expect(changes).toBe(0);
  });

  it("writes an exact branch code only when the reviewed military status is served or serving", () => {
    setPageUrl("https://www.skcareers.com/Application/Index/");
    document.body.innerHTML = `${militaryGate()}<select name="prsMilitarySvcStatus"><option value="302001" selected>군필</option><option value="302002">미필</option><option value="302003">면제</option><option value="302004">복무중</option></select><select name="prsMilitarySvcCategory"><option value="" selected>군별</option><option value="304001">육군</option><option value="304002">해군</option><option value="304003">공군</option><option value="304004">해병대</option><option value="304005">전투경찰</option><option value="304006">해양경찰</option><option value="304007">의무경찰</option><option value="304008">의무소방</option></select>`;
    document.querySelector<HTMLInputElement>(
      "[name='prsMilitarySvcYN'][value='1']",
    )!.checked = true;
    const handle = collectedHandle("prsMilitarySvcCategory");
    const branch = item(
      analysis(
        handle.candidateId,
        { type: "DIRECT", profileFieldKey: "military.military.militaryBranch" },
        { command: "SELECT_OPTION" },
      ),
      "해군",
    );
    branch.currentValue = "군필";

    expect(skWriteAdapter.tryWrite(handle, branch)).toEqual({
      handled: true,
      written: true,
    });
    expect(
      document.querySelector<HTMLSelectElement>(
        "[name='prsMilitarySvcCategory']",
      )?.value,
    ).toBe("304002");
  });

  it("rejects duplicate disability grade label and code evidence", () => {
    setPageUrl("https://www.skcareers.com/Application/Index/");
    document.body.innerHTML = `<label><input type="radio" name="prsDisabledYN" value="0" /> 비대상</label><label><input type="radio" name="prsDisabledYN" value="1" checked /> 대상</label><select name="prsDisabledType"><option value="306001">중증(기존1급~3급)</option><option value="306009">중증(기존1급~3급)</option></select>`;
    const handle = collectedHandle("prsDisabledType");
    const grade = item(
      analysis(
        handle.candidateId,
        {
          type: "LOOKUP",
          profileFieldKey: "disability.disability.disabilityGrade",
          optionMap: { 중증: "중증(기존1급~3급)" },
        },
        { command: "SELECT_OPTION" },
      ),
      "중증(기존1급~3급)",
    );

    expect(skWriteAdapter.tryWrite(handle, grade)).toEqual({
      handled: true,
      written: false,
    });
  });

  it("writes veteran text only behind its exact positive status gate and is idempotent", () => {
    setPageUrl("https://www.skcareers.com/Application/Index/");
    document.body.innerHTML = `<label><input type="radio" name="prsVeteranBenefitYN" value="0" /> 비대상</label><label><input type="radio" name="prsVeteranBenefitYN" value="1" checked /> 대상</label><input id="prsVeteranBenefitNumber" name="prsVeteranBenefitNumber" />`;
    const handle = collectedHandle("prsVeteranBenefitNumber");
    const number = item(
      analysis(
        handle.candidateId,
        { type: "DIRECT", profileFieldKey: "veteran.veteran.veteranNumber" },
        { command: "SET_TEXT" },
      ),
      "synthetic-number",
    );
    const input = document.querySelector<HTMLInputElement>(
      "#prsVeteranBenefitNumber",
    )!;
    let events = 0;
    input.addEventListener("input", () => events++);

    expect(skWriteAdapter.tryWrite(handle, number)).toEqual({
      handled: true,
      written: true,
    });
    expect(input.value).toBe("synthetic-number");
    expect(events).toBe(1);
    expect(skWriteAdapter.tryWrite(handle, number)).toEqual({
      handled: true,
      written: true,
    });
    expect(events).toBe(1);
  });
});
describe("SK status writer safety regressions", () => {
  function statusMarkup(selected = "302001"): string {
    return `<label><input type="radio" name="prsMilitarySvcYN" value="0" disabled /> 비대상</label><label><input type="radio" name="prsMilitarySvcYN" value="1" checked /> 대상</label><select name="prsMilitarySvcStatus"><option value="302001"${selected === "302001" ? " selected" : ""}>군필</option><option value="302002"${selected === "302002" ? " selected" : ""}>미필</option><option value="302003">면제</option><option value="302004">복무중</option></select>`;
  }

  it("accepts the live-shaped disabled negative peer and preserves a same negative value without events", () => {
    setPageUrl("https://www.skcareers.com/Application/Index/");
    document.body.innerHTML = militaryGate();
    const negative = document.querySelector<HTMLInputElement>("[value='0']")!;
    negative.checked = true;
    let events = 0;
    negative.addEventListener("change", () => events++);
    const handle = collectedHandle("prsMilitarySvcYN");
    const result = skWriteAdapter.tryWrite(
      handle,
      item(
        analysis(
          handle.candidateId,
          {
            type: "LOOKUP",
            profileFieldKey: "military.military.militaryStatus",
            optionMap: { 비대상: "비대상" },
          },
          { command: "CHECK_RADIO" },
        ),
        "비대상",
      ),
    );

    expect(result).toEqual({ handled: true, written: true });
    expect(negative.checked).toBe(true);
    expect(events).toBe(0);
  });

  it("writes status with the real DIRECT binding when its disabled negative peer is present", () => {
    setPageUrl("https://www.skcareers.com/Application/Index/");
    document.body.innerHTML = statusMarkup("302002");
    const select = document.querySelector<HTMLSelectElement>(
      "[name='prsMilitarySvcStatus']",
    )!;
    select.value = "";
    let events = 0;
    select.addEventListener("change", () => events++);
    const handle = collectedHandle("prsMilitarySvcStatus");

    expect(
      skWriteAdapter.tryWrite(
        handle,
        item(
          analysis(
            handle.candidateId,
            {
              type: "DIRECT",
              profileFieldKey: "military.military.militaryStatus",
            },
            { command: "SELECT_OPTION" },
          ),
          "군필",
        ),
      ),
    ).toEqual({ handled: true, written: true });
    expect(select.value).toBe("302001");
    expect(events).toBe(1);
  });

  it("preserves an existing different status without events and rejects foreign LOOKUP", () => {
    setPageUrl("https://www.skcareers.com/Application/Index/");
    document.body.innerHTML = statusMarkup("302002");
    const select = document.querySelector<HTMLSelectElement>(
      "[name='prsMilitarySvcStatus']",
    )!;
    let events = 0;
    select.addEventListener("change", () => events++);
    const handle = collectedHandle("prsMilitarySvcStatus");
    const direct = item(
      analysis(
        handle.candidateId,
        { type: "DIRECT", profileFieldKey: "military.military.militaryStatus" },
        { command: "SELECT_OPTION" },
      ),
      "군필",
    );
    const foreign = item(
      analysis(
        handle.candidateId,
        {
          type: "LOOKUP",
          profileFieldKey: "military.military.militaryStatus",
          optionMap: { 군필: "군필" },
        },
        { command: "SELECT_OPTION" },
      ),
      "군필",
    );

    expect(skWriteAdapter.tryWrite(handle, direct)).toEqual({
      handled: true,
      written: false,
    });
    expect(skWriteAdapter.tryWrite(handle, foreign)).toEqual({
      handled: true,
      written: false,
    });
    expect(select.value).toBe("302002");
    expect(events).toBe(0);
  });

  it("rejects duplicate status controls and duplicate target option codes", () => {
    setPageUrl("https://www.skcareers.com/Application/Index/");
    document.body.innerHTML = `${statusMarkup()}<select name="prsMilitarySvcStatus"><option value="302001">군필</option></select>`;
    const handle = collectedHandle("prsMilitarySvcStatus");
    const status = item(
      analysis(
        handle.candidateId,
        { type: "DIRECT", profileFieldKey: "military.military.militaryStatus" },
        { command: "SELECT_OPTION" },
      ),
      "군필",
    );
    expect(skWriteAdapter.tryWrite(handle, status)).toEqual({
      handled: true,
      written: false,
    });

    document.body.innerHTML = `${militaryGate()}<select name="prsMilitarySvcStatus"><option value="302001">군필</option><option value="302001">군필</option><option value="302002">미필</option><option value="302003">면제</option><option value="302004">복무중</option></select>`;
    document.querySelector<HTMLInputElement>("[value='1']")!.checked = true;
    const duplicateCode = collectedHandle("prsMilitarySvcStatus");
    expect(
      skWriteAdapter.tryWrite(
        duplicateCode,
        item(
          analysis(
            duplicateCode.candidateId,
            {
              type: "DIRECT",
              profileFieldKey: "military.military.militaryStatus",
            },
            { command: "SELECT_OPTION" },
          ),
          "군필",
        ),
      ),
    ).toEqual({ handled: true, written: false });
  });
});
