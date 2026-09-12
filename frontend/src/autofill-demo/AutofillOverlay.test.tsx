import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  AnalysisApiClient,
  FieldsAnalyzeRequest,
  PreparationAnalyzeRequest,
} from "../autofill/api/types";
import { createEmptyProfile } from "../profile/model";
import type { ProfileRepository } from "../profile/profile-repository";
import { AutofillOverlay } from "./AutofillOverlay";
import {
  createApiClient,
  createRepository,
  createSkFixtureDocument,
} from "./AutofillOverlay.test-fixtures";

describe("AutofillOverlay", () => {
  it.each([true, false])(
    "recollects dependent exam options only after a successful language selection (%s)",
    async (selectionAvailable) => {
      const pageDocument = createSkFixtureDocument();
      pageDocument.body.innerHTML = `<section><select name="lngLanguageType"><option value="">선택</option><option>${selectionAvailable ? "영어" : "프랑스어"}</option></select><select name="lngExamName"><option value="">선택</option></select></section>`;
      const language = pageDocument.querySelector<HTMLSelectElement>(
        "[name=lngLanguageType]",
      )!;
      const exam =
        pageDocument.querySelector<HTMLSelectElement>("[name=lngExamName]")!;
      language.addEventListener("change", () => {
        exam.innerHTML =
          '<option value="">선택</option><option>시험 A</option>';
      });
      const profile = createEmptyProfile();
      profile.languages = [
        {
          id: "language-1",
          sectionId: "languageTest",
          values: { language: "영어", testName: "시험 A" },
        },
      ];
      const observedLanguageValues: string[] = [];
      const apiClient: AnalysisApiClient = {
        analyzePreparation: createApiClient().analyzePreparation,
        analyzeFields: async (request) => {
          observedLanguageValues.push(language.value);
          return {
            snapshotId: request.snapshotId,
            mode: "ADAPTER",
            analysisStatus: "COMPLETE",
            fields: request.sections
              .flatMap((section) => section.fields)
              .flatMap((field) => {
                if (
                  field.domName !== "lngLanguageType" &&
                  !field.options?.some(
                    (option) => option.displayName === "시험 A",
                  )
                )
                  return [];
                return [
                  {
                    candidateId: field.candidateId,
                    matchType: "MATCH" as const,
                    valueBinding: {
                      type: "DIRECT" as const,
                      profileFieldKey:
                        field.domName === "lngLanguageType"
                          ? "languages.languageTest.language"
                          : "languages.languageTest.testName",
                    },
                    autofillPolicy: "ALLOWED" as const,
                    mappingStatus: "ADAPTER_VERIFIED" as const,
                    interactionStatus: "READY" as const,
                    writePlan: { command: "SELECT_OPTION" as const },
                  },
                ];
              }),
          };
        },
      };
      render(
        <AutofillOverlay
          onClose={vi.fn()}
          apiClient={apiClient}
          repository={{ ...createRepository(), load: async () => profile }}
          pageDocument={pageDocument}
        />,
      );
      await screen.findByRole("heading", {
        name: selectionAvailable
          ? "기입 결과"
          : "조건부 선택을 안전하게 적용하지 못했습니다",
      });
      expect(observedLanguageValues).toEqual(
        selectionAvailable ? ["", "영어"] : [""],
      );
      expect(exam.value).toBe(selectionAvailable ? "시험 A" : "");
    },
  );

  it.each([
    ["READY", 1, false, false],
    ["BLOCKED", 1, false, false],
    ["MANUAL_REVEAL_REQUIRED", 1, false, false],
    ["SYSTEM_CONTROL", 1, false, false],
    ["UNVERIFIED", 1, false, false],
    ["READY", 2, false, false],
    ["READY", 1, true, false],
    ["READY", 1, false, true],
  ] as const)(
    "writes revealed bindings with %s authority and %i profile entries (blocked analysis: %s, mismatched binding: %s)",
    async (
      interactionStatus,
      profileEntryCount,
      blockedAnalysis,
      mismatchedBinding,
    ) => {
      const pageDocument = createSkFixtureDocument();
      pageDocument.body.innerHTML = `<section><h2>학력</h2><button id="reveal" type="button">펼치기</button><input name="eduMajorDouble" aria-label="복수전공명" /></section>`;
      const profile = createEmptyProfile();
      profile.education = [
        {
          id: "university-1",
          sectionId: "university",
          values: {
            doubleMajorStatus: "있음",
            additionalMajorName: "시험 전공",
          },
        },
      ];
      profile.contact.email = "있음";
      if (profileEntryCount === 2)
        profile.education.push({
          ...profile.education[0]!,
          id: "university-2",
        });
      let preparationPass = 0;
      let fieldsPass = 0;
      const apiClient: AnalysisApiClient = {
        analyzePreparation: async (request) => {
          preparationPass += 1;
          const section = request.sections.find((section) =>
            section.actionCandidates.some(
              (action) => action.domId === "reveal",
            ),
          )!;
          const action = section.actionCandidates.find(
            (action) => action.domId === "reveal",
          )!;
          return {
            snapshotId: request.snapshotId,
            mode: "ADAPTER",
            analysisStatus: "COMPLETE",
            preparationPlans: [
              preparationPass === 1
                ? {
                    actionCandidateId: action.candidateId,
                    command: "REVEAL_SECTION",
                    expectedEffect: "TARGET_VISIBLE",
                    targetSectionId: section.sectionId,
                  }
                : {
                    actionCandidateId: action.candidateId,
                    command: "SELECT_OPTION_TO_REVEAL",
                    expectedEffect: "TARGET_FIELDS_VISIBLE",
                    targetSectionId: section.sectionId,
                    profileFieldKey: "contact.contact.email",
                    expectedFieldNames: ["eduMajorDouble"],
                    revealedFieldBindings: {
                      eduMajorDouble:
                        "education.university.additionalMajorName",
                    },
                  },
            ],
          };
        },
        analyzeFields: async (request) => {
          fieldsPass += 1;
          const field = request.sections
            .flatMap((section) => section.fields)
            .find((field) => field.domName === "eduMajorDouble")!;
          return {
            snapshotId: request.snapshotId,
            mode: "ADAPTER",
            analysisStatus:
              fieldsPass === 1 && blockedAnalysis ? "BLOCKED" : "COMPLETE",
            fields:
              fieldsPass === 1
                ? [
                    {
                      candidateId: field.candidateId,
                      matchType: "MATCH",
                      valueBinding: {
                        type: "DIRECT",
                        profileFieldKey: mismatchedBinding
                          ? "education.university.minorName"
                          : "education.university.additionalMajorName",
                      },
                      autofillPolicy: "ALLOWED",
                      mappingStatus: "ADAPTER_VERIFIED",
                      interactionStatus,
                      writePlan: { command: "SET_TEXT" },
                    },
                  ]
                : [],
          };
        },
      };
      // The verified follow-up selection remains a native select action.
      const selection = pageDocument.createElement("select");
      selection.id = "reveal";
      // Authority is tested independently of an existing opposite selection.
      selection.innerHTML =
        '<option value="">선택하세요</option><option value="0">없음</option><option value="1">있음</option>';
      pageDocument
        .querySelector("button")!
        .addEventListener("click", (event) => {
          (event.currentTarget as Element).replaceWith(selection);
        });
      render(
        <AutofillOverlay
          onClose={vi.fn()}
          apiClient={apiClient}
          repository={{ ...createRepository(), load: async () => profile }}
          pageDocument={pageDocument}
        />,
      );
      await screen.findByRole("heading", { name: "기입 결과" });
      expect(fieldsPass).toBe(2);
      expect(
        pageDocument.querySelector<HTMLInputElement>("[name=eduMajorDouble]")!
          .value,
      ).toBe(
        interactionStatus === "READY" &&
          profileEntryCount === 1 &&
          !blockedAnalysis &&
          !mismatchedBinding
          ? "시험 전공"
          : "",
      );
    },
  );

  it("does not log locally resolved values for dependent fields", async () => {
    const pageDocument =
      document.implementation.createHTMLDocument("application");
    pageDocument.body.innerHTML =
      '<section><input name="eduMajorDouble" aria-label="복수전공명" /></section>';
    const profile = createEmptyProfile();
    profile.education = [
      {
        id: "university-1",
        sectionId: "university",
        values: {
          doubleMajorStatus: "있음",
          additionalMajorName: "PRIVATE_PROFILE_SENTINEL",
        },
      },
    ];
    const apiClient = createApiClient();
    apiClient.analyzeFields = async (request) => ({
      snapshotId: request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      fields: [
        {
          candidateId: request.sections[0]!.fields[0]!.candidateId,
          matchType: "MATCH",
          valueBinding: {
            type: "DIRECT",
            profileFieldKey: "education.university.additionalMajorName",
          },
          autofillPolicy: "ALLOWED",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          writePlan: { command: "SET_TEXT" },
        },
      ],
    });
    const logged: unknown[][] = [];
    const info = vi.spyOn(console, "info").mockImplementation((...args) => {
      logged.push(args);
    });
    try {
      render(
        <AutofillOverlay
          onClose={vi.fn()}
          apiClient={apiClient}
          repository={{ ...createRepository(), load: async () => profile }}
          pageDocument={pageDocument}
        />,
      );
      await screen.findByRole("heading", { name: "기입 결과" });
      expect(pageDocument.querySelector("input")?.value).toBe(
        "PRIVATE_PROFILE_SENTINEL",
      );
      expect(JSON.stringify(logged)).not.toContain("PRIVATE_PROFILE_SENTINEL");
    } finally {
      info.mockRestore();
    }
  });

  it("shows only the final result after automatic analysis and writing", async () => {
    const pageDocument =
      document.implementation.createHTMLDocument("application");
    pageDocument.body.innerHTML = `
      <section><input aria-label="이메일" /></section>
    `;

    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={createApiClient()}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("1 / 3")).not.toBeInTheDocument();
    expect(screen.queryByText("2 / 3")).not.toBeInTheDocument();
    expect(pageDocument.querySelector("input")?.value).toBe("me@example.test");
  });

  it("writes a verified conditional field in the result-only flow", async () => {
    const pageDocument =
      document.implementation.createHTMLDocument("application");
    pageDocument.body.innerHTML = `
      <div class="apply-form-box">
        <div class="form-item-group cert-Item">
          <input aria-label="자격증명" />
        </div>
      </div>
    `;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: createApiClient().analyzePreparation,
      analyzeFields: vi.fn(async (request: FieldsAnalyzeRequest) => {
        const candidate = request.sections
          .flatMap((section) => [
            ...section.fields,
            ...(section.items?.flatMap((item) => item.fields) ?? []),
          ])
          .at(0);
        if (!candidate) throw new Error("fixture page is missing its field");
        return {
          snapshotId: request.snapshotId,
          mode: "ADAPTER" as const,
          analysisStatus: "COMPLETE" as const,
          fields: [
            {
              candidateId: candidate.candidateId,
              matchType: "MATCH" as const,
              profileFieldKey: "certifications.certificate.name",
              autofillPolicy: "CONDITIONAL" as const,
              mappingStatus: "ADAPTER_VERIFIED" as const,
              interactionStatus: "READY" as const,
              writePlan: { command: "SET_TEXT" as const },
            },
          ],
        };
      }),
    };
    const profile = createEmptyProfile();
    profile.certifications = [
      {
        id: "certificate-1",
        sectionId: "certificate",
        values: { name: "자격증 A" },
      },
    ];
    const profileRepository: ProfileRepository = {
      ...createRepository(),
      load: vi.fn(async () => profile),
    };

    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={profileRepository}
        pageDocument={pageDocument}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument();
    expect(pageDocument.querySelector("input")?.value).toBe("자격증 A");
  });

  it("reanalyzes newly added education rows before filling conditional majors", async () => {
    const pageDocument =
      document.implementation.createHTMLDocument("application");
    pageDocument.body.innerHTML = `
      <section>
        <h2>학력</h2>
        <button id="btnAddEducationUniv" type="button">대학 학력 정보 추가</button>
      </section>
    `;
    const section = pageDocument.querySelector("section")!;
    const addButton = pageDocument.querySelector("button")!;
    addButton.addEventListener("click", () => {
      const row = pageDocument.createElement("div");
      row.className = "educationuniv-item";
      row.innerHTML = `
        <label><input type="radio" name="eduMajorDoubleYN" /> 없음</label>
        <label><input type="radio" name="eduMajorDoubleYN" /> 있음</label>
        <input name="eduMajorDouble" hidden />
        <label><input type="radio" name="eduMajorSubYN" /> 없음</label>
        <label><input type="radio" name="eduMajorSubYN" /> 있음</label>
        <input name="eduMajorSub" hidden />
      `;
      row.querySelectorAll("input[type=radio]").forEach((radio) => {
        radio.addEventListener("click", () => {
          const name = radio.getAttribute("name");
          if (
            name === "eduMajorDoubleYN" &&
            radio.parentElement?.textContent?.includes("있음")
          ) {
            (
              row.querySelector("[name=eduMajorDouble]") as HTMLInputElement
            ).hidden = false;
          }
          if (
            name === "eduMajorSubYN" &&
            radio.parentElement?.textContent?.includes("있음")
          ) {
            (
              row.querySelector("[name=eduMajorSub]") as HTMLInputElement
            ).hidden = false;
          }
        });
      });
      section.insertBefore(row, addButton);
    });
    const profile = createEmptyProfile();
    profile.education = [
      {
        id: "university-1",
        sectionId: "university",
        values: { doubleMajorStatus: "있음", minorStatus: "있음" },
      },
    ];
    const repository: ProfileRepository = {
      ...createRepository(),
      load: vi.fn(async () => profile),
    };
    let preparationCallCount = 0;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request: PreparationAnalyzeRequest) => {
        preparationCallCount += 1;
        const actions = request.sections.flatMap(
          (candidate) => candidate.actionCandidates,
        );
        const add = actions.find(
          (candidate) => candidate.domId === "btnAddEducationUniv",
        );
        if (preparationCallCount === 1 && add) {
          return {
            snapshotId: request.snapshotId,
            mode: "ADAPTER" as const,
            analysisStatus: "COMPLETE" as const,
            preparationPlans: [
              {
                actionCandidateId: add.candidateId,
                command: "ADD_REPEATABLE_GROUP" as const,
                expectedEffect: "GROUP_COUNT_INCREMENT" as const,
                expectedFieldNames: ["eduMajorDouble"],
              },
            ],
          };
        }
        const doubleMajor = actions.find(
          (candidate) =>
            candidate.domName === "eduMajorDoubleYN" &&
            candidate.displayName === "있음",
        );
        const minor = actions.find(
          (candidate) =>
            candidate.domName === "eduMajorSubYN" &&
            candidate.displayName === "있음",
        );
        return {
          snapshotId: request.snapshotId,
          mode: "ADAPTER" as const,
          analysisStatus: "COMPLETE" as const,
          preparationPlans: [
            ...(doubleMajor
              ? [
                  {
                    actionCandidateId: doubleMajor.candidateId,
                    command: "SELECT_OPTION_TO_REVEAL" as const,
                    expectedEffect: "TARGET_FIELDS_VISIBLE" as const,
                    profileFieldKey: "education.university.doubleMajorStatus",
                    optionDisplayName: "있음",
                    expectedFieldNames: ["eduMajorDouble"],
                    targetSectionId: request.sections[0]!.sectionId,
                  },
                ]
              : []),
            ...(minor
              ? [
                  {
                    actionCandidateId: minor.candidateId,
                    command: "SELECT_OPTION_TO_REVEAL" as const,
                    expectedEffect: "TARGET_FIELDS_VISIBLE" as const,
                    profileFieldKey: "education.university.minorStatus",
                    optionDisplayName: "있음",
                    expectedFieldNames: ["eduMajorSub"],
                    targetSectionId: request.sections[0]!.sectionId,
                  },
                ]
              : []),
          ],
        };
      }),
      analyzeFields: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "ADAPTER" as const,
        analysisStatus: "COMPLETE" as const,
        fields: [],
      })),
    };

    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={repository}
        pageDocument={pageDocument}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument();
    expect(apiClient.analyzePreparation).toHaveBeenCalledTimes(2);
    expect(
      (
        pageDocument.querySelectorAll(
          "[name=eduMajorDoubleYN]",
        )[1] as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      (
        pageDocument.querySelectorAll(
          "[name=eduMajorSubYN]",
        )[1] as HTMLInputElement
      ).checked,
    ).toBe(true);
  });
});
