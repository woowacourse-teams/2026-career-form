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
        schemaVersion: 3 as const,
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
  it.each([
    ['title="우편번호"', "BLOCKED"],
    ['placeholder="Enter ZIP code"', "BLOCKED"],
    ['title="도로명주소"', "AUTO"],
    ['title="zipper"', "AUTO"],
  ])("uses only the matched element's own postal text: %s", async (attribute, expected) => {
    document.body.innerHTML = `<label>기본주소<input name="address" ${attribute}></label>`;
    const profile = fullProfile();
    profile.contact.addressLine1 = "합성 기본주소";
    const { byName, analyzeRequests } = await run({
      field: () => ({
        profileFieldKey: "contact.contact.addressLine1",
        confidence: 0.95,
        categoryConfirmed: true,
        interactionStatus: "READY",
        autofillPolicy: "ALLOWED",
        writePlan: { command: "SET_TEXT" },
      }),
    }, profile);
    expect(byName("address").grade?.grade).toBe(expected);
    if (expected === "BLOCKED")
      expect(byName("address").grade?.reason).toBe("FORMAT_KEY_MISMATCH");
    expect(analyzeRequests[0]?.sections.flatMap((section) => section.fields)[0])
      .not.toHaveProperty("title");
  });

  it("does not borrow a postal title from an ancestor or another field", async () => {
    document.body.innerHTML = `<div title="우편번호"><label>성<input name="family" title="이름"></label><input title="ZIP code"></div>`;
    const { byName } = await run();
    expect(byName("family").grade?.grade).toBe("AUTO");
  });

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

const direct = (profileFieldKey: string): FieldOverride => ({
  profileFieldKey,
  confidence: 0.92,
  categoryConfirmed: true,
  autofillPolicy: "ALLOWED",
  interactionStatus: "READY",
  writePlan: { command: "SET_TEXT" },
});

const derived = (
  recipe: NonNullable<
    Extract<
      NonNullable<GenericFieldsResponse["fields"][number]["binding"]>,
      { type: "DERIVED" }
    >["recipe"]
  >,
  override: FieldOverride = {},
): FieldOverride => ({
  profileFieldKey: null,
  binding: { type: "DERIVED", recipe },
  confidence: 0.92,
  categoryConfirmed: true,
  autofillPolicy: "ALLOWED",
  interactionStatus: "READY",
  writePlan: { command: "SET_TEXT" },
  ...override,
});

function nameProfile(): Profile {
  const profile = createEmptyProfile();
  profile.personal.koreanFamilyName = "합성성씨";
  profile.personal.koreanGivenName = "합성이름";
  profile.personal.englishFamilyName = "Synthfamily";
  profile.personal.englishGivenName = "Synthgiven";
  return profile;
}

function mountNameForm() {
  document.body.innerHTML = `
    <form>
      <h2>인적사항</h2>
      <label>이름<input name="fullName" /></label>
      <label>영문 이름<input name="englishName" /></label>
    </form>`;
}

describe("generic synthetic name bindings", () => {
  it("keeps a name recipe field as a DERIVED match with the response policy", async () => {
    mountNameForm();

    const { byName } = await run(
      {
        field: (candidate) =>
          candidate.domName === "fullName"
            ? derived("KOREAN_FULL_NAME", { autofillPolicy: "CONDITIONAL" })
            : {},
      },
      nameProfile(),
    );

    expect(byName("fullName").field).toEqual({
      candidateId: byName("fullName").field.candidateId,
      matchType: "MATCH",
      valueBinding: { type: "DERIVED", recipe: "KOREAN_FULL_NAME" },
      mappingStatus: "LLM_SUGGESTED",
      autofillPolicy: "CONDITIONAL",
      interactionStatus: "READY",
      writePlan: { command: "SET_TEXT" },
    });
    expect(byName("fullName").grade).toEqual({ grade: "AUTO" });
    expect(byName("englishName").field).toMatchObject({ matchType: "NO_MATCH" });
  });

  it.each([
    ["KOREAN_FULL_NAME", "koreanGivenName"],
    ["ENGLISH_FULL_NAME_GIVEN_FIRST", "englishGivenName"],
    ["ENGLISH_FULL_NAME_FAMILY_FIRST", "englishFamilyName"],
  ] as const)(
    "grades %s AUTO with both name keys and BLOCKED without %s",
    async (recipe, missingKey) => {
      mountNameForm();
      const options = {
        field: (candidate: FieldCandidate) =>
          candidate.domName === "fullName" ? derived(recipe) : {},
      };

      const full = await run(options, nameProfile());
      const fullGrade = full.byName("fullName").grade;
      document.body.replaceChildren();
      mountNameForm();
      const partial = nameProfile();
      partial.personal[missingKey] = "";
      const missing = await run(options, partial);

      expect(fullGrade).toEqual({ grade: "AUTO" });
      expect(missing.byName("fullName").grade).toEqual({
        grade: "BLOCKED",
        reason: "NO_PROFILE_VALUE",
      });
    },
  );

  it("keeps split family and given name fields as two DIRECT bindings", async () => {
    document.body.innerHTML = `
      <form>
        <h2>인적사항</h2>
        <label>성<input name="family" /></label>
        <label>이름<input name="given" /></label>
      </form>`;

    const { byName } = await run(
      {
        field: (candidate) =>
          candidate.domName === "given"
            ? direct("personal.personal.koreanGivenName")
            : {},
      },
      nameProfile(),
    );

    expect(byName("family").field).toMatchObject({
      valueBinding: {
        type: "DIRECT",
        profileFieldKey: "personal.personal.koreanFamilyName",
      },
    });
    expect(byName("given").field).toMatchObject({
      valueBinding: {
        type: "DIRECT",
        profileFieldKey: "personal.personal.koreanGivenName",
      },
    });
    expect(byName("family").grade).toEqual({ grade: "AUTO" });
    expect(byName("given").grade).toEqual({ grade: "AUTO" });
  });
});

describe("generic date part bindings", () => {
  const numbered = (from: number, to: number, suffix = "", pad = false) =>
    Array.from({ length: to - from + 1 }, (_, index) => {
      const value = String(from + index);
      return `<option>${pad ? value.padStart(2, "0") : value}${suffix}</option>`;
    }).join("");

  function mountBirthSelects(month = numbered(1, 12, "월", true)) {
    document.body.innerHTML = `
      <form>
        <h2>인적사항</h2>
        <select name="by"><option value="">년</option>${numbered(1990, 2010)}</select>
        <select name="bm"><option value="">월</option>${month}</select>
        <select name="bd"><option value="">일</option>${numbered(1, 31, "일", true)}</select>
      </form>`;
  }

  const part = (kind: "YEAR" | "MONTH" | "DAY"): FieldOverride => ({
    profileFieldKey: "personal.personal.birthDate",
    binding: { type: "DATE_PART", part: kind },
    confidence: 0.92,
    categoryConfirmed: true,
    autofillPolicy: "ALLOWED",
    interactionStatus: "READY",
    writePlan: { command: "SELECT_OPTION" },
  });
  const parts = (candidate: FieldCandidate): FieldOverride =>
    candidate.domName === "by"
      ? part("YEAR")
      : candidate.domName === "bm"
        ? part("MONTH")
        : candidate.domName === "bd"
          ? part("DAY")
          : {};

  function birthProfile(): Profile {
    const profile = createEmptyProfile();
    profile.personal.birthDate = "2000-01-01";
    return profile;
  }

  it("binds each part select to the option of the local date through a LOOKUP", async () => {
    mountBirthSelects();

    const { byName } = await run({ field: parts }, birthProfile());

    expect(byName("by").field).toEqual({
      candidateId: byName("by").field.candidateId,
      matchType: "MATCH",
      valueBinding: {
        type: "LOOKUP",
        profileFieldKey: "personal.personal.birthDate",
        optionMap: { "2000-01-01": "2000" },
      },
      mappingStatus: "LLM_SUGGESTED",
      autofillPolicy: "ALLOWED",
      interactionStatus: "READY",
      writePlan: { command: "SELECT_OPTION" },
    });
    expect(byName("bm").field).toMatchObject({
      valueBinding: { optionMap: { "2000-01-01": "01월" } },
    });
    expect(byName("bd").field).toMatchObject({
      valueBinding: { optionMap: { "2000-01-01": "01일" } },
    });
    for (const name of ["by", "bm", "bd"])
      expect(byName(name).grade).toEqual({ grade: "AUTO" });
  });

  it("blocks a part whose local value is not among the options", async () => {
    mountBirthSelects(numbered(2, 12, "월", true));

    const { byName } = await run({ field: parts }, birthProfile());

    expect(byName("bm").grade).toEqual({
      grade: "BLOCKED",
      reason: "DATE_PART_OPTIONS_MISMATCH",
    });
    expect(byName("by").grade).toEqual({ grade: "AUTO" });
  });

  it("blocks a numeric non-date select that receives a DATE_PART binding", async () => {
    document.body.innerHTML = `
      <form>
        <h2>인적사항</h2>
        <select name="gpa"><option value="">학점</option><option>4.5</option><option>4.0</option><option>3.5</option><option>3.0</option></select>
      </form>`;

    const { byName } = await run(
      { field: (candidate) => (candidate.domName === "gpa" ? part("MONTH") : {}) },
      birthProfile(),
    );

    expect(byName("gpa").grade).toEqual({
      grade: "BLOCKED",
      reason: "DATE_PART_OPTIONS_MISMATCH",
    });
  });

  it("blocks a part select without a usable local date", async () => {
    mountBirthSelects();
    const empty = birthProfile();
    empty.personal.birthDate = "";

    const { byName } = await run({ field: parts }, empty);

    expect(byName("by").grade).toEqual({
      grade: "BLOCKED",
      reason: "NO_PROFILE_VALUE",
    });
  });

  it("does not send the local date or its parts in any request", async () => {
    mountBirthSelects();

    const { classifyRequests, analyzeRequests } = await run(
      { field: parts },
      birthProfile(),
    );

    const bodies = JSON.stringify([classifyRequests, analyzeRequests]);
    expect(bodies).not.toContain("2000-01-01");
    expect(bodies).not.toContain("birthDate");
  });
});
