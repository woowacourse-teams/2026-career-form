import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  AnalysisApiClient,
  FieldsAnalyzeRequest,
  PreparationAnalyzeResponse,
  PreparationAnalyzeRequest,
} from "../autofill/api/types";
import { AnalysisServiceError } from "../autofill/api/runtime-client";
import { createEmptyProfile } from "../profile/model";
import type { ProfileRepository } from "../profile/profile-repository";
import { AutofillOverlay } from "./AutofillOverlay";

function createRepository(): ProfileRepository {
  const profile = createEmptyProfile();
  profile.contact.email = "me@example.test";
  return {
    load: vi.fn(async () => profile),
    save: vi.fn(async () => undefined),
    loadLayout: vi.fn(async () => "a" as const),
    saveLayout: vi.fn(async () => undefined),
  };
}

function createApiClient(): AnalysisApiClient {
  return {
    analyzePreparation: vi.fn(async (request: PreparationAnalyzeRequest) => ({
      snapshotId: request.snapshotId,
      mode: "GENERIC" as const,
      analysisStatus: "COMPLETE" as const,
      preparationPlans: [],
    })),
    analyzeFields: vi.fn(async (request: FieldsAnalyzeRequest) => {
      const candidate = request.sections[0]?.fields[0];
      if (!candidate) throw new Error("fixture page is missing its field");
      return {
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        fields: [
          {
            candidateId: candidate.candidateId,
            matchType: "MATCH" as const,
            profileFieldKey: "contact.contact.email",
            autofillPolicy: "ALLOWED" as const,
            mappingStatus: "LLM_SUGGESTED" as const,
            interactionStatus: "READY" as const,
            writePlan: { command: "SET_TEXT" as const },
          },
        ],
      };
    }),
  };
}

function createSkFixtureDocument(): Document {
  const fixtureDocument =
    document.implementation.createHTMLDocument("application");
  return new Proxy(fixtureDocument, {
    get(target, key) {
      if (key === "location")
        return { host: "www.skcareers.com", pathname: "/apply" };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

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
      selection.innerHTML = "<option>없음</option><option>있음</option>";
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
        values: { doubleMajorStatus: "있음", additionalMajorName: "PRIVATE_PROFILE_SENTINEL" },
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

  it.skip("shows the twelve-step spinner while analysis is in progress", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(
        () => new Promise<PreparationAnalyzeResponse>(() => undefined),
      ),
      analyzeFields: vi.fn(),
    };

    const { container } = render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "지원서 분석 중" }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("[data-spinner-bar]")).toHaveLength(12);
  });

  it.skip("shows the preparation action label from the DOM candidate", async () => {
    const pageDocument =
      document.implementation.createHTMLDocument("application");
    pageDocument.body.innerHTML = `
      <section><button type="button">Add certification</button></section>
    `;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request: PreparationAnalyzeRequest) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: [
          {
            actionCandidateId:
              request.sections[0]?.actionCandidates[0]!.candidateId,
            command: "ADD_REPEATABLE_GROUP" as const,
            expectedEffect: "GROUP_COUNT_INCREMENT" as const,
          },
        ],
      })),
      analyzeFields: vi.fn(),
    };

    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    expect(await screen.findByText("1개 준비")).toBeInTheDocument();
  });

  it.skip("summarizes preparation actions behind one continue button", async () => {
    const pageDocument =
      document.implementation.createHTMLDocument("application");
    pageDocument.body.innerHTML = `
      <section><button type="button">학력 항목 추가</button></section>
      <section><button type="button">어학 항목 추가</button></section>
    `;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request: PreparationAnalyzeRequest) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: request.sections.flatMap((section) =>
          section.actionCandidates.map(({ candidateId }) => ({
            actionCandidateId: candidateId,
            command: "ADD_REPEATABLE_GROUP" as const,
            expectedEffect: "GROUP_COUNT_INCREMENT" as const,
          })),
        ),
      })),
      analyzeFields: vi.fn(),
    };

    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    expect(await screen.findByText("2개 준비")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "준비하고 계속" }),
    ).toBeInTheDocument();
  });

  it.skip("does not execute a preparation action until the user explicitly approves it", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `
      <section><button type="button">추가 정보 열기</button></section>
      <section hidden><button type="button">보조 동작</button><label>이메일 <input type="email" /></label></section>
    `;
    const reveal = pageDocument.querySelector("button")!;
    const targetSection = pageDocument.querySelectorAll("section")[1]!;
    reveal.addEventListener("click", () => {
      targetSection.hidden = false;
    });
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request: PreparationAnalyzeRequest) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: [
          {
            actionCandidateId:
              request.sections[0]?.actionCandidates[0]!.candidateId,
            command: "REVEAL_SECTION" as const,
            expectedEffect: "TARGET_VISIBLE" as const,
            targetSectionId: request.sections[1]!.sectionId,
          },
        ],
      })),
      analyzeFields: vi.fn(async (request) => {
        const candidate = request.sections[0]?.fields[0]!;
        return {
          snapshotId: request.snapshotId,
          mode: "GENERIC" as const,
          analysisStatus: "COMPLETE" as const,
          fields: [
            {
              candidateId: candidate.candidateId,
              matchType: "MATCH" as const,
              profileFieldKey: "contact.contact.email",
              autofillPolicy: "ALLOWED" as const,
              mappingStatus: "LLM_SUGGESTED" as const,
              interactionStatus: "READY" as const,
              writePlan: { command: "SET_TEXT" as const },
            },
          ],
        };
      }),
    };
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "입력 항목 준비" }),
    ).toBeInTheDocument();
    expect(targetSection.hidden).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "준비하고 계속" }));

    await waitFor(() => expect(targetSection.hidden).toBe(false));
    expect(pageDocument.querySelector("input")?.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "1개 항목 기입하기" }));
    expect(
      await screen.findByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument();
    expect(pageDocument.querySelector("input")?.value).toBe("me@example.test");
  });

  it.skip("executes all safe preparation actions with one continue action", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `
      <section>
        <button type="button">첫 번째 영역 열기</button>
        <div hidden>첫 번째 영역</div>
      </section>
      <section>
        <button type="button">두 번째 영역 열기</button>
        <div hidden>두 번째 영역</div>
      </section>
    `;
    const sections = [...pageDocument.querySelectorAll("section")];
    const buttons = [...pageDocument.querySelectorAll("button")];
    buttons.forEach((button, index) => {
      button.addEventListener("click", () => {
        sections[index]!.querySelector("div")!.hidden = false;
      });
    });
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request: PreparationAnalyzeRequest) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: request.sections.map((section) => ({
          actionCandidateId: section.actionCandidates[0]!.candidateId,
          command: "REVEAL_SECTION" as const,
          expectedEffect: "TARGET_VISIBLE" as const,
          targetSectionId: section.sectionId,
        })),
      })),
      analyzeFields: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        fields: [],
      })),
    };
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    await screen.findByRole("button", { name: "준비하고 계속" });
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "준비하고 계속" }));

    await waitFor(() => {
      expect(sections[0]!.querySelector("div")!.hidden).toBe(false);
      expect(sections[1]!.querySelector("div")!.hidden).toBe(false);
    });
    expect(
      await screen.findByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument();
  });

  it.skip("keeps the page unchanged until final approval, then writes the selected fixture result", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `<label>이메일 <input type="email" /></label>`;
    const pageInput = pageDocument.querySelector("input")!;
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={createApiClient()}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    const dialog = await screen.findByRole("dialog", {
      name: "지원서 자동 기입",
    });
    expect(pageInput.value).toBe("");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "1개 항목 기입하기" }),
    );
    expect(
      await within(dialog).findByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument();
    expect(pageInput.value).toBe("me@example.test");
    expect(
      await within(dialog).findByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument();
  });

  it.skip("fills every available field before showing the grouped result", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `
      <section data-section="contact"><h2>연락처</h2><label>이메일 <input type="email" /></label></section>
    `;
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={createApiClient()}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "1개 항목 기입하기" }),
    );
    expect(
      await screen.findByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument();
    expect(pageDocument.querySelector("input")?.value).toBe("me@example.test");
    expect(
      screen.getByText(
        "성공한 항목은 지원서에서 한 번만 확인해 주세요. 저장과 제출은 직접 진행합니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("직접 확인 필요")).toBeInTheDocument();
  });

  it.skip("shows the target, existing local value, planned value, and result reason for a conflict", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `<label>이메일 <input type="email" value="already@page.test" /></label>`;
    const pageInput = pageDocument.querySelector("input")!;
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={createApiClient()}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    expect(
      await screen.findByText("현재 입력값: already@page.test"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("입력 예정값: me@example.test"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이메일 포함하기" }));
    await screen.findByRole("button", { name: "이메일 제외하기" });
    fireEvent.click(screen.getByRole("button", { name: "1개 항목 기입하기" }));

    expect(pageInput.value).toBe("me@example.test");
    expect(await screen.findByText("기입 성공")).toBeInTheDocument();
  });

  it("shows only a safe client failure reason when the analysis server is unavailable", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `<label>이메일 <input type="email" /></label>`;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async () => {
        throw new AnalysisServiceError("분석 서버가 아직 설정되지 않았습니다.");
      }),
      analyzeFields: vi.fn(),
    };
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: "분석 서버가 아직 설정되지 않았습니다.",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("me@example.test")).not.toBeInTheDocument();
  });

  it.skip("displays a review field with its mapping and interaction status", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `<label>이메일 <input type="email" /></label>`;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request: PreparationAnalyzeRequest) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: [],
      })),
      analyzeFields: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "PARTIAL" as const,
        warningCodes: ["LLM_UNAVAILABLE" as const],
        fields: [
          {
            candidateId: request.sections[0]?.fields[0]!.candidateId,
            matchType: "MATCH" as const,
            profileFieldKey: "contact.contact.email",
            autofillPolicy: "CONDITIONAL" as const,
            mappingStatus: "LLM_SUGGESTED" as const,
            interactionStatus: "READY" as const,
            writePlan: { command: "SET_TEXT" as const },
          },
        ],
      })),
    };
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "자동 기입 확인" }),
    ).toBeInTheDocument();
  });

  it.skip("shows available fields first and omits unavailable fields", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `
      <label>사용 가능 필드 <input type="email" /></label>
      <label>확인 필요 필드 <input type="email" /></label>
      <label>입력 불가 필드 <input type="email" /></label>
      <label>충돌 필드 <input type="email" value="기존 값" /></label>
    `;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request: PreparationAnalyzeRequest) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: [],
      })),
      analyzeFields: vi.fn(async (request: FieldsAnalyzeRequest) => {
        const candidates = request.sections.flatMap(
          (section) => section.fields,
        );
        return {
          snapshotId: request.snapshotId,
          mode: "GENERIC" as const,
          analysisStatus: "COMPLETE" as const,
          fields: [
            {
              candidateId: candidates[0]!.candidateId,
              matchType: "MATCH" as const,
              profileFieldKey: "contact.contact.email",
              autofillPolicy: "ALLOWED" as const,
              mappingStatus: "LLM_SUGGESTED" as const,
              interactionStatus: "READY" as const,
              writePlan: { command: "SET_TEXT" as const },
            },
            {
              candidateId: candidates[1]!.candidateId,
              matchType: "MATCH" as const,
              profileFieldKey: "contact.contact.email",
              autofillPolicy: "CONDITIONAL" as const,
              mappingStatus: "LLM_SUGGESTED" as const,
              interactionStatus: "READY" as const,
              writePlan: { command: "SET_TEXT" as const },
            },
            {
              candidateId: candidates[2]!.candidateId,
              matchType: "NO_MATCH" as const,
              mappingStatus: "LLM_SUGGESTED" as const,
              interactionStatus: "BLOCKED" as const,
              reasonCodes: ["NO_MATCH"] as ["NO_MATCH"],
            },
            {
              candidateId: candidates[3]!.candidateId,
              matchType: "MATCH" as const,
              profileFieldKey: "contact.contact.email",
              autofillPolicy: "ALLOWED" as const,
              mappingStatus: "LLM_SUGGESTED" as const,
              interactionStatus: "READY" as const,
              writePlan: { command: "SET_TEXT" as const },
            },
          ],
        };
      }),
    };

    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    const reviewGroup = await screen.findByRole("region", {
      name: "확인 필요한 항목",
    });
    expect(
      within(reviewGroup).getByRole("heading", {
        name: "확인 필요한 항목 2개",
      }),
    ).toBeInTheDocument();
    expect(
      within(reviewGroup)
        .getAllByRole("article")
        .map((item) => item.querySelector("strong")?.textContent),
    ).toEqual(["확인 필요 필드", "충돌 필드"]);
    expect(screen.queryByText("입력 불가 필드")).not.toBeInTheDocument();
  });

  it.skip("keeps both sensitive current and planned values masked until the user reveals them", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `<label>병역 <input value="기존 병역 값" /></label>`;
    const profile = createEmptyProfile();
    profile.military.militaryStatus = "복무 완료";
    const repository: ProfileRepository = {
      load: vi.fn(async () => profile),
      save: vi.fn(async () => undefined),
      loadLayout: vi.fn(async () => "a" as const),
      saveLayout: vi.fn(async () => undefined),
    };
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request: PreparationAnalyzeRequest) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: [],
      })),
      analyzeFields: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        fields: [
          {
            candidateId: request.sections[0]?.fields[0]!.candidateId,
            matchType: "MATCH" as const,
            profileFieldKey: "military.military.militaryStatus",
            autofillPolicy: "SENSITIVE_CONFIRMATION" as const,
            mappingStatus: "LLM_SUGGESTED" as const,
            interactionStatus: "READY" as const,
            writePlan: { command: "SET_TEXT" as const },
          },
        ],
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
      await screen.findByText("현재 입력값: ••••••••"),
    ).toBeInTheDocument();
    expect(screen.getByText("입력 예정값: ••••••••")).toBeInTheDocument();
    expect(screen.queryByText("복무 완료")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "병역 값 보기" }));

    expect(screen.getByText("입력 예정값: 복무 완료")).toBeInTheDocument();
    expect(screen.getByText("현재 입력값: 기존 병역 값")).toBeInTheDocument();
  });

  it.skip("includes ordinary fields without a separate approval control", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `<label>이메일 <input type="email" /></label>`;
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={createApiClient()}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "1개 항목 기입하기" }),
    );
    await screen.findByRole("heading", { name: "기입 결과" });

    expect(
      screen.queryByText("이메일: 승인하지 않아 건너뜀"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("사용자가 승인한 입력 항목이 아닙니다."),
    ).not.toBeInTheDocument();
    expect(pageDocument.querySelector("input")?.value).toBe("me@example.test");
  });

  it.skip("shows the locally calculated count before approving a repeatable-group action", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `<section><h2>자격증·면허증</h2><button type="button">추가</button></section>`;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: [
          {
            actionCandidateId:
              request.sections[0]?.actionCandidates[0]!.candidateId,
            command: "ADD_REPEATABLE_GROUP" as const,
            expectedEffect: "GROUP_COUNT_INCREMENT" as const,
          },
        ],
      })),
      analyzeFields: vi.fn(),
    };
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    expect(
      await screen.findByText("현재 화면의 입력 행을 그대로 사용합니다."),
    ).toBeInTheDocument();
  });

  it.skip("adds the local profile shortfall from the live repeatable row count after approval", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `
      <section>
        <h2>자격증·면허증</h2>
        <div data-repeatable-group></div>
        <button type="button">추가</button>
      </section>
    `;
    const profile = createEmptyProfile();
    profile.certifications = [
      { id: "certificate-1", sectionId: "certificate", values: {} },
      { id: "certificate-2", sectionId: "certificate", values: {} },
      { id: "certificate-3", sectionId: "certificate", values: {} },
    ];
    const repository: ProfileRepository = {
      load: vi.fn(async () => profile),
      save: vi.fn(async () => undefined),
      loadLayout: vi.fn(async () => "a" as const),
      saveLayout: vi.fn(async () => undefined),
    };
    const section = pageDocument.querySelector("section")!;
    const add = pageDocument.querySelector("button")!;
    let clicks = 0;
    add.addEventListener("click", () => {
      clicks += 1;
      const row = pageDocument.createElement("div");
      row.dataset.repeatableGroup = "";
      section.insertBefore(row, add);
    });
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: [
          {
            actionCandidateId:
              request.sections[0]?.actionCandidates[0]!.candidateId,
            command: "ADD_REPEATABLE_GROUP" as const,
            expectedEffect: "GROUP_COUNT_INCREMENT" as const,
          },
        ],
      })),
      analyzeFields: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
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
      await screen.findByText("입력 행 2개를 추가합니다."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "준비하고 계속" }));

    expect(
      await screen.findByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument();
    expect(clicks).toBe(2);
    expect(
      pageDocument.querySelectorAll("[data-repeatable-group]"),
    ).toHaveLength(3);
  });

  it.skip("counts education profile entries by high school, university, and graduate section", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `
      <div class="apply-form-box education-root">
        <h3>학력</h3>
        <button id="btnAddEducationHigh" class="btnAddEducationHigh" type="button">추가</button>
        <button id="btnAddEducationUniv" class="btnAddEducationUniv" type="button">추가</button>
        <button id="btnAddEducationGrad" class="btnAddEducationGrad" type="button">추가</button>
      </div>
    `;
    const profile = createEmptyProfile();
    profile.education = [
      { id: "high-school-1", sectionId: "highSchool", values: {} },
      { id: "university-1", sectionId: "university", values: {} },
    ];
    const repository: ProfileRepository = {
      load: vi.fn(async () => profile),
      save: vi.fn(async () => undefined),
      loadLayout: vi.fn(async () => "a" as const),
      saveLayout: vi.fn(async () => undefined),
    };
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request: PreparationAnalyzeRequest) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: request.sections[0]!.actionCandidates.map(
          ({ candidateId }) => ({
            actionCandidateId: candidateId,
            command: "ADD_REPEATABLE_GROUP" as const,
            expectedEffect: "GROUP_COUNT_INCREMENT" as const,
          }),
        ),
      })),
      analyzeFields: vi.fn(),
    };

    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={repository}
        pageDocument={pageDocument}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("입력 행 2개를 추가합니다."),
    ).toBeInTheDocument();
  });

  it.skip("matches certification categories by core words in section labels", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML =
      '<section><h2>자격/면허</h2><div data-repeatable-group></div><button type="button">추가</button></section>';
    const profile = createEmptyProfile();
    profile.certifications = [
      { id: "certificate-1", sectionId: "certificate", values: {} },
      { id: "certificate-2", sectionId: "certificate", values: {} },
      { id: "certificate-3", sectionId: "certificate", values: {} },
    ];
    const repository: ProfileRepository = {
      load: vi.fn(async () => profile),
      save: vi.fn(async () => undefined),
      loadLayout: vi.fn(async () => "a" as const),
      saveLayout: vi.fn(async () => undefined),
    };
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: [
          {
            actionCandidateId:
              request.sections[0]?.actionCandidates[0]!.candidateId,
            command: "ADD_REPEATABLE_GROUP" as const,
            expectedEffect: "GROUP_COUNT_INCREMENT" as const,
          },
        ],
      })),
      analyzeFields: vi.fn(),
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
      await screen.findByText("입력 행 2개를 추가합니다."),
    ).toBeInTheDocument();
  });

  it.skip("matches a certification category from an ungrouped action label", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `
      <div class="apply-form-box cert-root">
        <h3>자격/면허</h3>
        <div class="form-item-group"></div>
        <div class="form-item-group cert-Item"></div>
        <button type="button">자격/면허 추가</button>
      </div>
    `;
    const profile = createEmptyProfile();
    profile.certifications = [
      { id: "certificate-1", sectionId: "certificate", values: {} },
      { id: "certificate-2", sectionId: "certificate", values: {} },
      { id: "certificate-3", sectionId: "certificate", values: {} },
    ];
    const repository: ProfileRepository = {
      load: vi.fn(async () => profile),
      save: vi.fn(async () => undefined),
      loadLayout: vi.fn(async () => "a" as const),
      saveLayout: vi.fn(async () => undefined),
    };
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: [
          {
            actionCandidateId:
              request.sections.at(-1)?.actionCandidates[0]!.candidateId ??
              request.sections[0]?.actionCandidates[0]!.candidateId,
            command: "ADD_REPEATABLE_GROUP" as const,
            expectedEffect: "GROUP_COUNT_INCREMENT" as const,
          },
        ],
      })),
      analyzeFields: vi.fn(),
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
      await screen.findByText("입력 행 2개를 추가합니다."),
    ).toBeInTheDocument();
  });

  it.skip("accepts a revealed target section that contains fields but no action candidate", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `
      <section><button type="button">추가 정보 열기</button></section>
      <section hidden><label>이메일 <input type="email" /></label></section>
    `;
    const reveal = pageDocument.querySelector("button")!;
    const targetSection = pageDocument.querySelectorAll("section")[1]!;
    reveal.addEventListener("click", () => {
      targetSection.hidden = false;
    });
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: [
          {
            actionCandidateId:
              request.sections[0]?.actionCandidates[0]!.candidateId,
            command: "REVEAL_SECTION" as const,
            expectedEffect: "TARGET_VISIBLE" as const,
            targetSectionId: request.sections[1]!.sectionId,
          },
        ],
      })),
      analyzeFields: vi.fn(async (request) => {
        const candidate = request.sections[0]?.fields[0]!;
        return {
          snapshotId: request.snapshotId,
          mode: "GENERIC" as const,
          analysisStatus: "COMPLETE" as const,
          fields: [
            {
              candidateId: candidate.candidateId,
              matchType: "MATCH" as const,
              profileFieldKey: "contact.contact.email",
              autofillPolicy: "ALLOWED" as const,
              mappingStatus: "LLM_SUGGESTED" as const,
              interactionStatus: "READY" as const,
              writePlan: { command: "SET_TEXT" as const },
            },
          ],
        };
      }),
    };
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    await screen.findByRole("heading", { name: "입력 항목 준비" });
    fireEvent.click(screen.getByRole("button", { name: "준비하고 계속" }));

    await waitFor(() => expect(targetSection.hidden).toBe(false));
    expect(
      await screen.findByRole("heading", { name: "자동 기입 확인" }),
    ).toBeInTheDocument();
  });

  it("shows a generic safe state when analysis is unavailable", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `<label>이메일 <input type="email" /></label>`;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async () => {
        throw new Error("server carries no profile values");
      }),
      analyzeFields: vi.fn(),
    };
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: "분석을 완료하지 못했습니다",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("me@example.test")).not.toBeInTheDocument();
  });

  it("keeps profile values hidden when field analysis reports the page as blocked", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `<label>이메일 <input type="email" /></label>`;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: [],
      })),
      analyzeFields: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "BLOCKED" as const,
        fields: [],
        blockCode: "ADAPTER_STRUCTURE_MISMATCH" as const,
      })),
    };
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: "이 페이지에서는 자동 기입을 진행할 수 없습니다",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("me@example.test")).not.toBeInTheDocument();
    expect(pageDocument.querySelector("input")?.value).toBe("");
  });

  it("sends a fields snapshot when preparation analysis is blocked", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `<label>이메일 <input type="email" /></label>`;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "ADAPTER" as const,
        analysisStatus: "BLOCKED" as const,
        preparationPlans: [],
        blockCode: "ADAPTER_STRUCTURE_MISMATCH" as const,
      })),
      analyzeFields: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "ADAPTER" as const,
        analysisStatus: "BLOCKED" as const,
        fields: [],
        blockCode: "ADAPTER_STRUCTURE_MISMATCH" as const,
      })),
    };
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: "이 페이지에서는 자동 기입을 진행할 수 없습니다",
      }),
    ).toBeInTheDocument();
    expect(apiClient.analyzeFields).toHaveBeenCalledTimes(1);
    expect(pageDocument.querySelector("input")?.value).toBe("");
  });

  it.skip("fills only ready common fields after blocked preparation yields a partial result", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `
      <label>이메일 <input type="email" /></label>
      <label>직무 전용 항목 <input type="text" /></label>
    `;
    const [email, jobSpecific] = Array.from(
      pageDocument.querySelectorAll("input"),
    );
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "ADAPTER" as const,
        analysisStatus: "BLOCKED" as const,
        preparationPlans: [],
        blockCode: "ADAPTER_STRUCTURE_MISMATCH" as const,
      })),
      analyzeFields: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "ADAPTER" as const,
        analysisStatus: "PARTIAL" as const,
        fields: [
          {
            candidateId: request.sections[0]!.fields[0]!.candidateId,
            matchType: "MATCH" as const,
            profileFieldKey: "contact.contact.email",
            autofillPolicy: "ALLOWED" as const,
            mappingStatus: "ADAPTER_VERIFIED" as const,
            interactionStatus: "READY" as const,
            writePlan: { command: "SET_TEXT" as const },
          },
          {
            candidateId: request.sections[0]!.fields[1]!.candidateId,
            matchType: "NO_MATCH" as const,
            mappingStatus: "ADAPTER_VERIFIED" as const,
            interactionStatus: "BLOCKED" as const,
            reasonCodes: ["NO_MATCH"] as ["NO_MATCH"],
          },
        ],
      })),
    };

    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "자동 기입 확인" }),
    ).toBeInTheDocument();
    expect(email!.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "1개 항목 기입하기" }));
    expect(
      await screen.findByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument();
    expect(email!.value).toBe("me@example.test");
    expect(jobSpecific!.value).toBe("");
  });

  it.skip("stops before field analysis when an approved reveal action has no verified effect", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `
      <section><button type="button">추가 정보 열기</button></section>
      <section hidden><button type="button">보조 동작</button><label>이메일 <input type="email" /></label></section>
    `;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: [
          {
            actionCandidateId:
              request.sections[0]?.actionCandidates[0]!.candidateId,
            command: "REVEAL_SECTION" as const,
            expectedEffect: "TARGET_VISIBLE" as const,
            targetSectionId: request.sections[1]!.sectionId,
          },
        ],
      })),
      analyzeFields: vi.fn(),
    };
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "입력 항목 준비" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "준비하고 계속" }));

    expect(
      await screen.findByRole("heading", {
        name: "준비 대상 영역이 표시되지 않았습니다",
      }),
    ).toBeInTheDocument();
    expect(apiClient.analyzeFields).not.toHaveBeenCalled();
    expect(pageDocument.querySelector("input")?.value).toBe("");
  });

  it("closes from its action and the Escape key", () => {
    const closeFromAction = vi.fn();
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    const { unmount } = render(
      <AutofillOverlay
        onClose={closeFromAction}
        apiClient={createApiClient()}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "자동 기입 모달 닫기" }),
    );
    expect(closeFromAction).toHaveBeenCalledOnce();

    unmount();
    const shadowHost = document.createElement("div");
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    shadowRoot.append(container);
    document.body.append(shadowHost);
    shadowRoot.addEventListener("keydown", (event) => event.stopPropagation());

    const closeFromEscape = vi.fn();
    const overlay = render(
      <AutofillOverlay
        onClose={closeFromEscape}
        apiClient={createApiClient()}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
      { container },
    );
    fireEvent.keyDown(
      overlay.getByRole("button", { name: "자동 기입 모달 닫기" }),
      { key: "Escape" },
    );
    expect(closeFromEscape).toHaveBeenCalledOnce();
  });
});
