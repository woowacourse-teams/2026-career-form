import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AnalysisApiClient, FieldsAnalyzeResponse } from "../api/types";
import { collectFieldsSnapshot } from "../dom/collect";
import { SPLIT_EMAIL_REASON } from "../dom/split-email";
import { buildResultModel } from "./result-model";
import { buildReviewPlan } from "../review/review-plan";
import { executeApprovedWrites } from "../write/executor";
import { createEmptyProfile } from "../../profile/model";
import { AutofillWorkflow } from "./AutofillWorkflow";

afterEach(() => document.body.replaceChildren());

function fixture(current = "", split = true) {
  document.body.innerHTML = `<section><label for="local">Email</label><div>
    <input id="local" name="email" value="${current}">
    ${split ? '<span>@</span><select id="domain"><option value="">Direct input</option><option value="example.test">example.test</option></select>' : ""}
  </div></section>`;
  return document.querySelector<HTMLInputElement>("#local")!;
}

function setup(mode: FieldsAnalyzeResponse["mode"] = "GENERIC", email = "qa@example.test") {
  const snapshot = collectFieldsSnapshot(document);
  const field = snapshot.request.sections
    .flatMap((section) => section.fields)
    .find((entry) => entry.domId === "local")!;
  const profile = createEmptyProfile();
  profile.contact.email = email;
  const analysis: FieldsAnalyzeResponse = {
    snapshotId: snapshot.request.snapshotId,
    mode,
    analysisStatus: "COMPLETE",
    fields: [
      {
        candidateId: field.candidateId,
        matchType: "MATCH",
        valueBinding: {
          type: "DIRECT",
          profileFieldKey: "contact.contact.email",
        },
        autofillPolicy: "ALLOWED",
        mappingStatus:
          mode === "GENERIC" ? "LLM_SUGGESTED" : "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        writePlan: { command: "SET_TEXT" },
      },
    ],
  };
  return { snapshot, profile, analysis };
}

describe("generic split-email writing", () => {
  it("fills the local part and selects the matching domain", () => {
    const input = fixture("");
    const { snapshot, profile, analysis } = setup();
    const plan = buildReviewPlan({ analysis, profile, registry: snapshot.registry });
    expect(plan.items[0]?.status).toBe("available");
    const results = executeApprovedWrites({
      items: plan.items,
      approvedCandidateIds: new Set([plan.items[0]!.candidateId]),
      registry: snapshot.registry,
    });
    expect(input.value).toBe("qa");
    expect(document.querySelector<HTMLSelectElement>("#domain")!.value).toBe("example.test");
    expect(results[0]?.status).toBe("written");
  });

  it("keeps a different existing local part as a conflict", () => {
    const input = fixture("existing-local");
    const { snapshot, profile, analysis } = setup();
    const plan = buildReviewPlan({ analysis, profile, registry: snapshot.registry });
    const results = executeApprovedWrites({
      items: plan.items,
      approvedCandidateIds: new Set([plan.items[0]!.candidateId]),
      registry: snapshot.registry,
    });
    expect(input.value).toBe("existing-local");
    expect(document.querySelector<HTMLSelectElement>("#domain")!.value).toBe("");
    expect(results[0]?.status).toBe("skipped");
  });

  it("writes only the local part when no domain option matches the profile", () => {
    const input = fixture("");
    const { snapshot, profile, analysis } = setup("GENERIC", "qa@other.test");
    const plan = buildReviewPlan({ analysis, profile, registry: snapshot.registry });
    expect(plan.items[0]).toMatchObject({ status: "available", disabled: false });
    const results = executeApprovedWrites({
      items: plan.items,
      approvedCandidateIds: new Set([plan.items[0]!.candidateId]),
      registry: snapshot.registry,
    });
    expect(input.value).toBe("qa");
    expect(document.querySelector<HTMLSelectElement>("#domain")!.value).toBe("");
    expect(results[0]).toMatchObject({
      status: "skipped",
      failureCode: "SPLIT_EMAIL_UNSUPPORTED",
      reason: SPLIT_EMAIL_REASON,
    });
    expect(
      buildResultModel({ reviewItems: plan.items, results, profile }).pending[0]
        ?.failureCode,
    ).toBe("SPLIT_EMAIL_UNSUPPORTED");
  });

  it("fills an unlisted domain through the single custom entry option", () => {
    document.body.innerHTML = `<section><label for="local">Email</label><div>
      <input id="local"><span>@</span><select id="domain"><option value="">선택</option><option value="example.test">example.test</option><option value="custom">직접입력</option></select><input id="domain_text" style="display:none">
    </div></section>`;
    const select = document.querySelector<HTMLSelectElement>("#domain")!;
    const domainText = document.querySelector<HTMLInputElement>("#domain_text")!;
    select.addEventListener("change", () => {
      domainText.style.display = select.value === "custom" ? "" : "none";
    });
    const { snapshot, profile, analysis } = setup("GENERIC", "qa@other.test");
    const plan = buildReviewPlan({ analysis, profile, registry: snapshot.registry });
    const results = executeApprovedWrites({
      items: plan.items,
      approvedCandidateIds: new Set([plan.items[0]!.candidateId]),
      registry: snapshot.registry,
    });
    expect(document.querySelector<HTMLInputElement>("#local")!.value).toBe("qa");
    expect(select.value).toBe("custom");
    expect(domainText.value).toBe("other.test");
    expect(results[0]?.status).toBe("written");
  });

  it("leaves the domain select of a split pair to the pair instead of a separate item", () => {
    fixture("");
    const { snapshot, profile, analysis } = setup("GENERIC", "qa@other.test");
    const select = snapshot.request.sections
      .flatMap((section) => section.fields)
      .find((entry) => entry.domId === "domain")!;
    analysis.fields.push({
      candidateId: select.candidateId,
      matchType: "MATCH",
      valueBinding: { type: "DIRECT", profileFieldKey: "contact.contact.email" },
      autofillPolicy: "ALLOWED",
      mappingStatus: "LLM_SUGGESTED",
      interactionStatus: "READY",
      writePlan: { command: "SELECT_OPTION" },
    });
    const plan = buildReviewPlan({ analysis, profile, registry: snapshot.registry });
    expect(plan.items.map((item) => item.candidateId)).toEqual([
      analysis.fields[0]!.candidateId,
    ]);
  });

  it("splits a group introduced after review into its local part and domain", () => {
    const input = fixture("", false);
    const { snapshot, profile, analysis } = setup();
    const plan = buildReviewPlan({
      analysis,
      profile,
      registry: snapshot.registry,
    });
    input.insertAdjacentHTML(
      "afterend",
      "<span>@</span><select><option>example.test</option></select>",
    );
    const results = executeApprovedWrites({
      items: plan.items,
      approvedCandidateIds: new Set([plan.items[0]!.candidateId]),
      registry: snapshot.registry,
    });
    expect(input.value).toBe("qa");
    expect(input.parentElement!.querySelector("select")!.value).toBe("example.test");
    expect(results[0]?.status).toBe("written");
  });

  it.each([
    '<label><input id="local"></label> @ <span><select><option>example.test</option></select></span>',
    '<span><input id="local"></span><span> @ </span><span><select><option>example.test</option></select></span>',
  ])("recognizes split controls through simple wrappers: %s", (markup) => {
    document.body.innerHTML = `<section>${markup}</section>`;
    const { snapshot, profile, analysis } = setup();
    expect(
      buildReviewPlan({ analysis, profile, registry: snapshot.registry })
        .items[0]?.status,
    ).toBe("available");
  });

  it.each([
    '<input id="local"> @ <select><option>Other choice</option></select>',
    '<input id="local"><input> @ <select><option>example.test</option></select>',
    '<input id="local"><span>Contact @ company</span><select><option>example.test</option></select>',
  ])("does not classify ambiguous structures: %s", (markup) => {
    document.body.innerHTML = `<section>${markup}</section>`;
    const { snapshot, profile, analysis } = setup();
    expect(
      buildReviewPlan({ analysis, profile, registry: snapshot.registry })
        .items[0]?.status,
    ).toBe("available");
  });

  it("fills a standalone email with its complete address", () => {
    const input = fixture("", false);
    const { snapshot, profile, analysis } = setup();
    const plan = buildReviewPlan({
      analysis,
      profile,
      registry: snapshot.registry,
    });
    const results = executeApprovedWrites({
      items: plan.items,
      approvedCandidateIds: new Set([plan.items[0]!.candidateId]),
      registry: snapshot.registry,
    });
    expect(input.value).toBe("qa@example.test");
    expect(results[0]?.status).toBe("written");
  });

  it("does not infer split email from unrelated neighboring fields", () => {
    const input = fixture("", false);
    document
      .querySelector("section")!
      .insertAdjacentHTML(
        "beforeend",
        "<label>Other <input></label><span>@</span><select><option>example.test</option></select>",
      );
    const { snapshot, profile, analysis } = setup();
    const plan = buildReviewPlan({
      analysis,
      profile,
      registry: snapshot.registry,
    });
    executeApprovedWrites({
      items: plan.items,
      approvedCandidateIds: new Set([plan.items[0]!.candidateId]),
      registry: snapshot.registry,
    });
    expect(input.value).toBe("qa@example.test");
  });

  it("leaves adapter-verified writes unchanged", () => {
    const input = fixture();
    const { snapshot, profile, analysis } = setup("ADAPTER");
    const plan = buildReviewPlan({
      analysis,
      profile,
      registry: snapshot.registry,
    });
    executeApprovedWrites({
      items: plan.items,
      approvedCandidateIds: new Set([plan.items[0]!.candidateId]),
      registry: snapshot.registry,
    });
    expect(input.value).toBe("qa@example.test");
  });

  it("shows the domain of a split field without a matching option in production workflow results", async () => {
    const input = fixture();
    const profile = createEmptyProfile();
    profile.contact.email = "qa@other.test";
    const apiClient: AnalysisApiClient = {
      analyzePreparation: async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC",
        analysisStatus: "COMPLETE",
        preparationPlans: [],
      }),
      analyzeFields: async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC",
        analysisStatus: "COMPLETE",
        fields: request.sections
          .flatMap((section) => section.fields)
          .map((field) =>
            field.domId === "local"
              ? {
                  candidateId: field.candidateId,
                  matchType: "MATCH" as const,
                  valueBinding: {
                    type: "DIRECT" as const,
                    profileFieldKey: "contact.contact.email",
                  },
                  autofillPolicy: "ALLOWED" as const,
                  mappingStatus: "LLM_SUGGESTED" as const,
                  interactionStatus: "READY" as const,
                  writePlan: { command: "SET_TEXT" as const },
                }
              : {
                  candidateId: field.candidateId,
                  matchType: "NO_MATCH" as const,
                  mappingStatus: "LLM_SUGGESTED" as const,
                  interactionStatus: "BLOCKED" as const,
                  reasonCodes: ["NO_MATCH"] as ["NO_MATCH"],
                },
          ),
      }),
    };
    const completed = new Promise<void>((resolve, reject) => {
      const observer = new MutationObserver(() => {
        if (!document.querySelector('[role="tabpanel"]')) return;
        observer.disconnect();
        clearTimeout(timeout);
        resolve();
      });
      const timeout = setTimeout(() => {
        observer.disconnect();
        reject(new Error("Workflow results did not render"));
      }, 3000);
      observer.observe(document.body, { childList: true, subtree: true });
    });
    render(
      <AutofillWorkflow
        apiClient={apiClient}
        repository={{ load: async () => profile }}
        pageDocument={document}
        onExit={() => undefined}
      />,
    );
    await completed;
    expect(input.value).toBe("qa");
    const pending = screen.getByRole("tabpanel", { name: /확인 필요/ });
    expect(pending.querySelector("article")).not.toBeNull();
    expect(pending.querySelector("article p")?.textContent).toBe(
      SPLIT_EMAIL_REASON,
    );
    expect(pending.querySelector("article")?.textContent).toContain(
      "qa@other.test",
    );
    fireEvent.click(screen.getByRole("tab", { name: /입력 완료/ }));
    expect(
      screen
        .getByRole("tabpanel", { name: /입력 완료/ })
        .querySelector("article"),
    ).toBeNull();
  });
});
