import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { onSiteEnter } from "../policy/__fixtures__/hplace-mrs2-search.synthetic";
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
it.each([
  { count: 2, enabled: true, initialMajorEnabled: false },
  { count: 1, enabled: true, initialMajorEnabled: false },
  { count: 1, enabled: true, initialMajorEnabled: true },
  { count: 2, enabled: false, initialMajorEnabled: false },
])(
  "prepares majors after school commit or reports them visibly (parents=$count, enabled=$enabled, initial=$initialMajorEnabled)",
  async ({ count, enabled, initialMajorEnabled }) => {
    setHplacePage(
      "https://synthetic.recruiter.im/mrs2/applicant/resume/writeResume",
    );
    const policy = mountEducation(count, 1, initialMajorEnabled);
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
      requests = 0,
      parentAdds = 0,
      preparations = 0;
    document.querySelector("#frm")!.addEventListener("submit", (e) => {
      e.preventDefault();
      forbidden++;
    });
    document.querySelector("#frm")!.addEventListener(
      "keypress",
      onSiteEnter(function search(e) {
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
          if (input.dataset.type === "college") {
            for (const e of widget
              .closest("[data-loop=college],[data-loop=graduateSchool]")!
              .querySelectorAll<HTMLInputElement | HTMLButtonElement>(
                "[data-loop=collegeMajor] input[type=search],[data-loop=collegeMajor] button[data-button=add]",
              ))
              e.disabled = e instanceof HTMLButtonElement && !enabled;
          }
          for (const e of widget
            .closest("[data-loop=collegeMajor]")
            ?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
              "input[type=radio],select",
            ) ?? [])
            e.disabled = false;
        };
      }),
    );
    document.querySelector("#frm")!.addEventListener("click", (e) => {
      const el = e.target;
      if (el instanceof Element && el.matches("[data-button=add]")) adds++;
      if (el instanceof Element && el.matches("[data-button=addCollege]"))
        parentAdds++;
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
          analyzePreparation: async (r) => {
            preparations++;
            return {
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
            };
          },
        }}
      />,
    );
    if (enabled) {
      await waitFor(
        () =>
          expect(
            document.querySelector<HTMLInputElement>(
              '[name="college[0].collegeMajor[2].majorName"]',
            )?.value,
          ).toBe("가상부전공"),
        { timeout: 120_000 },
      );
    } else {
      await screen.findByText("기입 결과", {}, { timeout: 120_000 });
      fireEvent.click(screen.getByRole("tab", { name: /확인 필요/ }));
      expect(
        screen.queryAllByText("입력 불가(학교 확정 후 다시 실행)"),
      ).toHaveLength(2);
      expect(screen.getByText("가상복수전공")).toBeVisible();
      expect(screen.getByText("가상부전공")).toBeVisible();
    }
    await waitFor(
      () =>
        expect(
          document.querySelector<HTMLSelectElement>(
            '[name="college[0].perfectScore"]',
          )!.value,
        ).toBe("4.5"),
      { timeout: 120_000 },
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
    if (enabled)
      expect(
        document.querySelector<HTMLInputElement>(
          '[name="college[0].collegeMajor[2].majorTypeCode"]:checked',
        )!.value,
      ).toBe("03");
    expect(adds).toBe(enabled ? 2 : 0);
    expect(searches).toBe(enabled ? 8 : 6);
    expect(parentAdds).toBe(2 - count);
    expect(preparations).toBeLessThanOrEqual(4);
    expect(forbidden).toBe(0);
    expect(requests).toBeLessThanOrEqual(8);
    expect(
      screen.queryByText("자동 기입을 진행하지 못했습니다."),
    ).not.toBeInTheDocument();
  },
  120_000,
);
