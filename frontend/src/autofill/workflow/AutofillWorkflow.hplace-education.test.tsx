import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AutofillWorkflow } from "./AutofillWorkflow";
import {
  mountEducation,
  educationProfile,
} from "../policy/__fixtures__/hplace-mrs2-education.synthetic";
import { setHplacePage, resetHplacePage } from "./test-utils/hplace.fixture";
import { installExecutionPolicy } from "./execution-policy";
import type { FieldsAnalyzeRequest, FieldsAnalyzeResponse } from "../api/types";
afterEach(() => {
  cleanup();
  resetHplacePage();
  installExecutionPolicy(document);
});
it("prepares parent-local majors, commits each search tuple and completes each numeric GPA pair", async () => {
  setHplacePage(
    "https://synthetic.recruiter.im/mrs2/applicant/resume/writeResume",
  );
  const policy = mountEducation();
  const profile = educationProfile();
  for (const e of document.querySelectorAll<
    HTMLInputElement | HTMLSelectElement
  >(
    "[data-loop=collegeMajor] input[type=radio],[data-loop=collegeMajor] select",
  ))
    e.disabled = true;
  const form =
    policy.browserPolicy!.schemaVersion === 2
      ? policy.browserPolicy!.nativeForm
      : undefined;
  let searches = 0,
    adds = 0,
    forbidden = 0,
    requests = 0;
  document.querySelector("#frm")!.addEventListener("submit", (e) => {
    e.preventDefault();
    forbidden++;
  });
  document
    .querySelector("#frm")!
    .addEventListener("keypress", function search(e) {
      const input = e.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "search")
        return;
      searches++;
      const widget = input.closest("div.span")!,
        results = widget.querySelector(".searchResult")!;
      const ul = document.createElement("ul");
      ul.className = "searchResultList";
      const li = document.createElement("li"),
        b = document.createElement("button");
      b.type = "button";
      b.className = "ellipsis";
      b.title = input.value;
      b.textContent = input.value;
      b.dataset.code = "123";
      li.append(b);
      ul.append(li);
      results.replaceChildren(ul);
      b.onclick = () => {
        widget.querySelector<HTMLInputElement>("input[type=hidden]")!.value =
          b.title;
        widget.querySelector<HTMLInputElement>("input.hidden")!.value = "123";
        widget.querySelector(".searchResultName")!.textContent = b.title;
        for (const e of widget
          .closest("[data-loop=collegeMajor]")
          ?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
            "input[type=radio],select",
          ) ?? [])
          e.disabled = false;
      };
    });
  document.querySelector("#frm")!.addEventListener("click", (e) => {
    const el = e.target;
    if (el instanceof Element && el.matches("[data-button=add]")) adds++;
    if (
      el instanceof Element &&
      el.matches(
        "[data-button=remove],[data-button=reset],[data-button=removeCollege]",
      )
    )
      forbidden++;
  });
  const analyzeFields = async (
    r: FieldsAnalyzeRequest,
  ): Promise<FieldsAnalyzeResponse> => {
    requests++;
    return {
      snapshotId: r.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      executionPolicy: policy,
      fields: r.sections
        .flatMap((s) => [
          ...s.fields,
          ...(s.items ?? []).flatMap((i) => i.fields),
        ])
        .map((f) => {
          const rule = form!.sections
            .flatMap((s) => s.fields)
            .find((x) => x.name === f.domName)!;
          return {
            candidateId: f.candidateId,
            matchType: "MATCH",
            mappingStatus: "ADAPTER_VERIFIED",
            interactionStatus: "READY",
            autofillPolicy: "ALLOWED",
            valueBinding: rule.binding,
            writePlan: {
              command:
                f.control === "select"
                  ? "SELECT_OPTION"
                  : f.control === "radio"
                    ? "CHECK_RADIO"
                    : "SET_TEXT",
            },
          };
        }),
    };
  };
  render(
    <AutofillWorkflow
      pageDocument={document}
      onExit={() => {}}
      repository={{ load: async () => profile }}
      apiClient={{
        loadExecutionPolicy: async () => policy,
        analyzeFields,
        analyzePreparation: async (r) => ({
          snapshotId: r.snapshotId,
          mode: "ADAPTER",
          analysisStatus: "COMPLETE",
          preparationPlans: r.sections
            .flatMap((s) => [
              ...s.actionCandidates,
              ...(s.items ?? []).flatMap((i) => i.actionCandidates),
            ])
            .map((a) => ({
              command: "ADD_REPEATABLE_GROUP",
              expectedEffect: "GROUP_COUNT_INCREMENT",
              actionCandidateId: a.candidateId,
            })),
        }),
      }}
    />,
  );
  await waitFor(
    () =>
      expect(
        document.querySelector<HTMLInputElement>(
          '[name="college[0].collegeMajor[2].majorName"]',
        )?.value,
      ).toBe("가상부전공"),
    { timeout: 15000 },
  );
  await waitFor(
    () =>
      expect(
        document.querySelector<HTMLSelectElement>(
          '[name="college[0].perfectScore"]',
        )!.value,
      ).toBe("4.5"),
    { timeout: 15000 },
  );
  expect(
    document.querySelector<HTMLInputElement>('[name="college[1].score"]')!
      .value,
  ).toBe("0");
  expect(
    document.querySelector<HTMLInputElement>(
      '[name="graduateSchool[0].collegeMajor[0].majorName"]',
    )!.value,
  ).toBe("가상연구전공");
  expect(
    document.querySelector<HTMLInputElement>(
      '[name="college[0].collegeMajor[2].majorTypeCode"]:checked',
    )!.value,
  ).toBe("03");
  expect(adds).toBe(2);
  expect(searches).toBe(8);
  expect(forbidden).toBe(0);
  expect(requests).toBeLessThanOrEqual(8);
  expect(
    screen.queryByText("자동 기입을 진행하지 못했습니다."),
  ).not.toBeInTheDocument();
}, 30000);
