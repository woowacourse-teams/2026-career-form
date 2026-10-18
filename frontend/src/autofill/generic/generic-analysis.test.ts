import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProfile, type Profile } from "../../profile/model";
import type {
  FieldCandidate,
  GenericFieldsRequest,
  GenericFieldsResponse,
  SectionClassifyRequest,
  SectionClassifyResponse,
} from "../api/types";
import { AnalysisContractError } from "../api/validate-response";
import { createAnalysisMessageHandler } from "../api/background-handler";
import { RuntimeAnalysisApiClient } from "../api/runtime-client";
import { collectFieldsSnapshot } from "../dom/collect";
import {
  analyzeGenericFields,
  createGenericAnalysisCache,
  GENERIC_SECTION_FAILURE,
} from "./generic-analysis";

afterEach(() => {
  document.body.replaceChildren();
  history.replaceState(null, "", "/");
});

const PREFILLED = "PREFILLED-SYNTHETIC-MARKER";

const KEYS: Record<string, string | null> = {
  family: "personal.personal.koreanFamilyName",
  email: "contact.contact.email",
  school: "education.university.schoolName",
  major: "education.university.majorName",
  motivation: null,
};

const CATEGORIES: Record<string, string> = {
  인적사항: "personal",
  학력: "education",
  기타: "NONE",
};

function mountThreeSections() {
  document.body.innerHTML = `
    <form>
      <h2>인적사항</h2>
      <label>성<input name="family" /></label>
      <label>이메일<input name="email" value="${PREFILLED}" /></label>
      <h2>학력</h2>
      <label>학교명<input name="school" /></label>
      <label>전공<input name="major" /></label>
      <h2>기타</h2>
      <label>지원 동기<textarea name="motivation"></textarea></label>
    </form>`;
}

function fullProfile(): Profile {
  const profile = createEmptyProfile();
  profile.personal.koreanFamilyName = "합성성씨";
  profile.contact.email = "synthetic-person@example.test";
  profile.education.push({
    id: "entry-1",
    sectionId: "university",
    values: { schoolName: "합성대학교", majorName: "합성전공학과" },
  });
  return profile;
}

const PROFILE_VALUES = [
  "합성성씨",
  "synthetic-person@example.test",
  "합성대학교",
  "합성전공학과",
];

type FieldOverride = Partial<GenericFieldsResponse["fields"][number]>;

interface ApiOptions {
  classify?: (
    request: SectionClassifyRequest,
  ) => Promise<SectionClassifyResponse> | SectionClassifyResponse;
  classifyStatus?: SectionClassifyResponse["status"];
  analyzeStatus?: GenericFieldsResponse["status"];
  analyzeError?: unknown;
  category?: (title: string | undefined) => string;
  field?: (candidate: FieldCandidate, category?: string) => FieldOverride;
}

function createApi(options: ApiOptions = {}) {
  const classifyRequests: SectionClassifyRequest[] = [];
  const analyzeRequests: GenericFieldsRequest[] = [];
  const api = {
    classifySections: async (request: SectionClassifyRequest) => {
      classifyRequests.push(structuredClone(request));
      if (options.classify) return options.classify(request);
      const status = options.classifyStatus ?? "COMPLETE";
      return {
        schemaVersion: 1 as const,
        snapshotId: request.snapshotId,
        status,
        sections:
          status === "COMPLETE"
            ? request.sections.map((section) => ({
                sectionId: section.sectionId,
                category:
                  options.category?.(section.title) ??
                  CATEGORIES[section.title ?? ""] ??
                  "NONE",
                confidence: 0.9,
              }))
            : [],
      };
    },
    analyzeGenericFields: async (request: GenericFieldsRequest) => {
      analyzeRequests.push(structuredClone(request));
      if (options.analyzeError) throw options.analyzeError;
      const status = options.analyzeStatus ?? "COMPLETE";
      return {
        schemaVersion: 2 as const,
        snapshotId: request.snapshotId,
        status,
        fields:
          status === "COMPLETE"
            ? request.sections.flatMap((section) =>
                section.fields.map((candidate) => {
                  const key = KEYS[candidate.domName ?? ""] ?? null;
                  const base: GenericFieldsResponse["fields"][number] = key
                    ? {
                        candidateId: candidate.candidateId,
                        profileFieldKey: key,
                        confidence: 0.92,
                        categoryConfirmed: true,
                        autofillPolicy: "ALLOWED",
                        interactionStatus: "READY",
                        writePlan: { command: "SET_TEXT" },
                      }
                    : {
                        candidateId: candidate.candidateId,
                        profileFieldKey: null,
                        confidence: 0,
                        categoryConfirmed: true,
                        interactionStatus: "BLOCKED",
                      };
                  return {
                    ...base,
                    ...options.field?.(candidate, section.category),
                  };
                }),
              )
            : [],
        diagnostics: { jevCalls: 1, elapsedMs: 1 },
      };
    },
  };
  return { api, classifyRequests, analyzeRequests };
}

function domNameOf(
  snapshot: ReturnType<typeof collectFieldsSnapshot>,
  candidateId: string,
) {
  const lookup = snapshot.registry.lookupField(candidateId);
  return "handle" in lookup ? lookup.handle.candidate.domName : undefined;
}

async function run(
  options: ApiOptions = {},
  profile: Profile = fullProfile(),
  cache = createGenericAnalysisCache(),
) {
  const snapshot = collectFieldsSnapshot(document);
  const calls = createApi(options);
  const result = await analyzeGenericFields(
    snapshot,
    document,
    calls.api,
    profile,
    cache,
  );
  const byName = (name: string) => {
    const field = result.analysis.fields.find(
      (entry) => domNameOf(snapshot, entry.candidateId) === name,
    );
    if (!field) throw new Error(`missing ${name}`);
    return { field, grade: result.grades.get(field.candidateId) };
  };
  return { snapshot, result, byName, ...calls };
}

describe("generic section analysis", () => {
  it("passes absent field context to grading instead of AUTO-selecting a confident match", async () => {
    document.body.innerHTML = '<input name="family">';
    const { byName } = await run();
    expect(byName("family").grade).toEqual({
      grade: "REVIEW",
      reason: "NO_FIELD_CONTEXT",
    });
  });

  it("passes input format hints to grading before approval", async () => {
    document.body.innerHTML = '<label>성<input name="family" type="email"></label>';
    const { byName } = await run();
    expect(byName("family").grade).toEqual({
      grade: "BLOCKED",
      reason: "FORMAT_KEY_MISMATCH",
    });
  });

  it("classifies each section once, sends its category and converts matches to the shared analysis shape", async () => {
    mountThreeSections();

    const { result, byName, classifyRequests, analyzeRequests } = await run();

    expect(classifyRequests).toHaveLength(1);
    expect(classifyRequests[0]!.schemaVersion).toBe(1);
    expect(
      classifyRequests[0]!.sections.map(({ title, labels, controlKinds }) => ({
        title,
        labels,
        controlKinds,
      })),
    ).toEqual([
      { title: "인적사항", labels: ["성", "이메일"], controlKinds: ["TEXT"] },
      { title: "학력", labels: ["학교명", "전공"], controlKinds: ["TEXT"] },
      { title: "기타", labels: ["지원 동기"], controlKinds: ["TEXTAREA"] },
    ]);
    expect(analyzeRequests).toHaveLength(1);
    expect(analyzeRequests[0]!.sections.map((s) => s.category)).toEqual([
      "personal",
      "education",
      "NONE",
    ]);
    expect(result.analysis).toMatchObject({
      mode: "GENERIC",
      analysisStatus: "COMPLETE",
    });
    expect(result.analysis.warningCodes).toBeUndefined();
    expect(byName("school").field).toEqual({
      candidateId: byName("school").field.candidateId,
      matchType: "MATCH",
      valueBinding: {
        type: "DIRECT",
        profileFieldKey: "education.university.schoolName",
      },
      mappingStatus: "LLM_SUGGESTED",
      autofillPolicy: "ALLOWED",
      interactionStatus: "READY",
      writePlan: { command: "SET_TEXT" },
    });
    expect(byName("school").grade).toEqual({ grade: "AUTO" });
    expect(byName("motivation").field).toEqual({
      candidateId: byName("motivation").field.candidateId,
      matchType: "NO_MATCH",
      mappingStatus: "LLM_SUGGESTED",
      interactionStatus: "BLOCKED",
      reasonCodes: ["NO_MATCH"],
    });
    expect(byName("motivation").grade).toBeUndefined();
    expect(
      result.sections.map(({ title, category }) => [title, category]),
    ).toEqual([
      ["인적사항", "personal"],
      ["학력", "education"],
      ["기타", "NONE"],
    ]);
  });

  it("copies the response policy, interaction status and write plan unchanged", async () => {
    mountThreeSections();

    const { byName } = await run({
      field: (candidate) =>
        candidate.domName === "email"
          ? {
              autofillPolicy: "SENSITIVE_CONFIRMATION",
              interactionStatus: "UNVERIFIED",
              writePlan: undefined,
            }
          : {},
    });

    expect(byName("email").field).toMatchObject({
      autofillPolicy: "SENSITIVE_CONFIRMATION",
      interactionStatus: "UNVERIFIED",
    });
    expect(byName("email").field).not.toHaveProperty("writePlan");
  });

  it.each(["MIXED", "ABSTAIN"])(
    "caps a %s section at REVIEW even when the field says the category is confirmed",
    async (category) => {
      mountThreeSections();

      const { byName } = await run({
        category: (title) =>
          title === "학력" ? category : (CATEGORIES[title ?? ""] ?? "NONE"),
      });

      expect(byName("school").grade).toEqual({
        grade: "REVIEW",
        reason: "CATEGORY_UNCONFIRMED",
      });
      expect(byName("family").grade).toEqual({ grade: "AUTO" });
    },
  );

  it("grades a field without a profile value as BLOCKED without sending the value state", async () => {
    mountThreeSections();

    const { byName } = await run({}, createEmptyProfile());

    expect(byName("school").grade).toEqual({
      grade: "BLOCKED",
      reason: "NO_PROFILE_VALUE",
    });
  });

  it.each([
    ["classification", { classifyStatus: "STATIC_POLICY_PRESENT" }],
    ["classification", { classifyStatus: "POLICY_UNAVAILABLE" }],
    ["field matching", { analyzeStatus: "STATIC_POLICY_PRESENT" }],
    ["field matching", { analyzeStatus: "POLICY_UNAVAILABLE" }],
  ] as const)(
    "blocks the whole analysis when %s reports %o",
    async (_step, options) => {
      mountThreeSections();

      const { result } = await run(options);

      expect(result.analysis.analysisStatus).toBe("BLOCKED");
      expect(
        result.analysis.fields.every((f) => f.matchType === "NO_MATCH"),
      ).toBe(true);
    },
  );
});

describe("section failure isolation", () => {
  it.each(["sections/classify", "fields/analyze"])(
    "preserves HTTP 404 from the real %s transport as ENDPOINT_UNAVAILABLE",
    async (endpoint) => {
      mountThreeSections();
      const snapshot = collectFieldsSnapshot(document);
      const calls = createApi();
      const fetcher = vi.fn<typeof fetch>(async (input, init) => {
        if (String(input).endsWith(`/generic/${endpoint}`))
          return new Response(null, { status: 404 });
        const request = JSON.parse(
          String(init?.body),
        ) as SectionClassifyRequest;
        return new Response(
          JSON.stringify(await calls.api.classifySections(request)),
          { status: 200 },
        );
      });
      const handler = createAnalysisMessageHandler({
        baseUrl: "https://api.example.test",
        fetcher,
      });
      const client = new RuntimeAnalysisApiClient(handler);

      const result = await analyzeGenericFields(
        snapshot,
        document,
        client,
        fullProfile(),
        createGenericAnalysisCache(),
      );

      expect(result.analysis.analysisStatus).toBe("PARTIAL");
      expect([...result.grades.values()]).toEqual(
        Array.from({ length: 5 }, () => ({
          grade: "BLOCKED",
          reason: "ENDPOINT_UNAVAILABLE",
        })),
      );
      expect(
        result.sections.every(
          (section) => section.blockedReason === "ENDPOINT_UNAVAILABLE",
        ),
      ).toBe(true);
      expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(
        endpoint === "sections/classify"
          ? ["https://api.example.test/api/v1/generic/sections/classify"]
          : [
              "https://api.example.test/api/v1/generic/sections/classify",
              "https://api.example.test/api/v1/generic/fields/analyze",
            ],
      );
    },
  );

  it("blocks only the section whose fields come back LLM_UNAVAILABLE", async () => {
    mountThreeSections();

    const { result, byName } = await run({
      field: (_candidate, category) =>
        category === "education"
          ? {
              profileFieldKey: null,
              confidence: 0,
              reason: "LLM_UNAVAILABLE",
              autofillPolicy: undefined,
              interactionStatus: "BLOCKED",
              writePlan: undefined,
            }
          : {},
    });

    for (const name of ["school", "major"]) {
      expect(byName(name).field.matchType).toBe("NO_MATCH");
      expect(byName(name).grade).toEqual({
        grade: "BLOCKED",
        reason: GENERIC_SECTION_FAILURE.LLM_UNAVAILABLE,
      });
    }
    expect(byName("family").grade).toEqual({ grade: "AUTO" });
    expect(byName("email").grade).toEqual({ grade: "AUTO" });
    expect(result.analysis.analysisStatus).toBe("PARTIAL");
    expect(result.analysis.warningCodes).toEqual(["LLM_UNAVAILABLE"]);
    expect(
      result.sections.map(({ title, blockedReason }) => [title, blockedReason]),
    ).toEqual([
      ["인적사항", undefined],
      ["학력", "LLM_UNAVAILABLE"],
      ["기타", undefined],
    ]);
  });

  it.each([
    ["a contract error", new AnalysisContractError(), "CLASSIFY_UNAVAILABLE"],
    ["a service error", new Error("unavailable"), "CLASSIFY_UNAVAILABLE"],
    [
      "an HTTP 404",
      Object.assign(new Error("not found"), { status: 404 }),
      "ENDPOINT_UNAVAILABLE",
    ],
  ])(
    "blocks the classified sections when classification fails with %s",
    async (_name, error, reason) => {
      mountThreeSections();

      const { result, analyzeRequests } = await run({
        classify: () => {
          throw error;
        },
      });

      expect(analyzeRequests).toHaveLength(0);
      expect(result.analysis.analysisStatus).toBe("PARTIAL");
      expect(
        result.analysis.fields.every((f) => f.matchType === "NO_MATCH"),
      ).toBe(true);
      expect(new Set([...result.grades.values()].map((g) => g.reason))).toEqual(
        new Set([reason]),
      );
      expect(result.grades.size).toBe(5);
    },
  );

  it.each([
    ["a service error", new Error("unavailable"), "ANALYZE_UNAVAILABLE"],
    [
      "an HTTP 404",
      Object.assign(new Error("not found"), { status: 404 }),
      "ENDPOINT_UNAVAILABLE",
    ],
  ])(
    "blocks the matched sections when field matching fails with %s",
    async (_name, error, reason) => {
      mountThreeSections();

      const { result } = await run({ analyzeError: error });

      expect(result.analysis.analysisStatus).toBe("PARTIAL");
      expect([...result.grades.values()]).toEqual(
        Array.from({ length: 5 }, () => ({ grade: "BLOCKED", reason })),
      );
      expect(result.sections.every((s) => s.blockedReason === reason)).toBe(
        true,
      );
    },
  );

  it("blocks only the section whose local processing throws", async () => {
    mountThreeSections();
    const snapshot = collectFieldsSnapshot(document);
    const broken = snapshot.request.sections
      .flatMap((section) => section.fields)
      .find((field) => field.domName === "major")!;
    Object.defineProperty(broken, "semanticContext", {
      get: () => {
        throw new Error("local failure");
      },
    });
    const calls = createApi();

    const result = await analyzeGenericFields(
      snapshot,
      document,
      calls.api,
      fullProfile(),
      createGenericAnalysisCache(),
    );

    const grade = (name: string) =>
      result.grades.get(
        snapshot.request.sections
          .flatMap((section) => section.fields)
          .find((field) => field.domName === name)!.candidateId,
      );
    expect(grade("school")).toEqual({
      grade: "BLOCKED",
      reason: "SECTION_PROCESSING_FAILED",
    });
    expect(grade("major")).toEqual({
      grade: "BLOCKED",
      reason: "SECTION_PROCESSING_FAILED",
    });
    expect(grade("family")).toEqual({ grade: "AUTO" });
    expect(calls.classifyRequests[0]!.sections.map((s) => s.title)).toEqual([
      "인적사항",
      "기타",
    ]);
  });
});

describe("section cache", () => {
  it("reuses unchanged sections and sends only a section whose field state changed", async () => {
    mountThreeSections();
    const cache = createGenericAnalysisCache();
    await run({}, fullProfile(), cache);

    const again = await run({}, fullProfile(), cache);
    expect(again.classifyRequests).toHaveLength(0);
    expect(again.analyzeRequests).toHaveLength(0);
    expect(again.byName("school").grade).toEqual({ grade: "AUTO" });
    expect(again.byName("school").field).toMatchObject({
      valueBinding: { profileFieldKey: "education.university.schoolName" },
    });

    document.querySelector<HTMLInputElement>("[name=major]")!.disabled = true;
    const changed = await run({}, fullProfile(), cache);
    expect(changed.classifyRequests).toHaveLength(1);
    expect(changed.classifyRequests[0]!.sections.map((s) => s.title)).toEqual([
      "학력",
    ]);
    const sent = changed.analyzeRequests[0]!.sections.flatMap((s) =>
      s.fields.map((f) => f.domName),
    );
    expect(sent).toEqual(["school", "major"]);
  });

  it("does not cache failed sections so a later analysis retries them", async () => {
    mountThreeSections();
    const cache = createGenericAnalysisCache();
    await run({ analyzeError: new Error("down") }, fullProfile(), cache);

    const retry = await run({}, fullProfile(), cache);

    expect(retry.classifyRequests).toHaveLength(1);
    expect(retry.byName("school").grade).toEqual({ grade: "AUTO" });
  });

  it("drops the cache when the page URL changes", async () => {
    mountThreeSections();
    const cache = createGenericAnalysisCache();
    await run({}, fullProfile(), cache);
    history.pushState(null, "", "/next-step");

    const next = await run({}, fullProfile(), cache);

    expect(next.classifyRequests).toHaveLength(1);
  });
});

describe("request privacy", () => {
  it("sends no profile value, current input value or profile item count, and the same body for empty and full profiles", async () => {
    mountThreeSections();
    const full = await run({}, fullProfile());
    const empty = await run({}, createEmptyProfile());

    const bodies = (calls: typeof full) =>
      JSON.stringify([calls.classifyRequests, calls.analyzeRequests]);
    const withoutSnapshot = (calls: typeof full) =>
      bodies(calls).replaceAll(calls.snapshot.request.snapshotId, "SNAPSHOT");
    for (const value of [...PROFILE_VALUES, PREFILLED])
      expect(bodies(full)).not.toContain(value);
    expect(bodies(full)).not.toMatch(/count|entries|itemIndex/i);
    expect(withoutSnapshot(full)).toBe(withoutSnapshot(empty));
  });

  it("passes collected display names, options and semantic context through unchanged", async () => {
    document.body.innerHTML = `
      <form>
        <h2>연락처</h2>
        <label>이메일<input name="email" type="email" required /></label>
        <label>국가<select name="country"><option>선택</option><option>합성국</option></select></label>
      </form>`;
    const { snapshot, analyzeRequests } = await run();

    const collected = snapshot.request.sections.flatMap((s) => s.fields);
    const sent = analyzeRequests[0]!.sections.flatMap((s) => s.fields);
    expect(sent).toEqual(JSON.parse(JSON.stringify(collected)));
    expect(sent[1]!.options?.map((o) => o.displayName)).toContain("합성국");
    expect(sent[0]!.semanticContext).toBeDefined();
  });
});
