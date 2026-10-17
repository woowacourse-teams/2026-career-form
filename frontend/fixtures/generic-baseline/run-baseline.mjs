// Generic autofill baseline runner (Issue #236).
// Drives the production AutofillWorkflow mounted by mount-workflow.tsx in
// headless Chromium and writes contract 1.1 observations plus timing data.
// It never reads provider keys; the backend owns its own configuration.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

const DRIVER_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(DRIVER_DIR, "../../..");
const PAGE = "harness/fixtures/generic-autofill/pages/large-generic-form.html";
const TRUTH =
  "harness/fixtures/generic-autofill/ground-truth-generic-jev-v1.json";
const PROFILE = "frontend/fixtures/profile-export.example.json";
const SITE_ID = "synthetic-large-generic-form";
const COLLECTION_DIR = "frontend/src/autofill/dom";
const RUN_TIMEOUT_MS = 180_000;
const RETENTION_DELAY_MS = 2_000;

const { values: args } = parseArgs({
  options: {
    provider: { type: "string" },
    model: { type: "string" },
    "timeout-ms": { type: "string" },
    "max-output-tokens": { type: "string", default: "8192" },
    runs: { type: "string", default: "5" },
    out: { type: "string" },
    url: {
      type: "string",
      default: "http://127.0.0.1:4173/fixtures/generic-baseline/index.html",
    },
    "metrics-url": { type: "string" },
    diagnose: { type: "boolean", default: false },
    screenshot: { type: "boolean", default: false },
    "check-only": { type: "boolean", default: false },
  },
});
// --check-only runs only the add-button check: Vite is enough, no backend or
// provider is involved.
for (const name of args["check-only"]
  ? ["out"]
  : ["provider", "model", "timeout-ms", "out"]) {
  if (!args[name]) throw new Error(`--${name} is required`);
}
const provider = args.provider;
const runCount = Number(args.runs);
const outDir = resolve(args.out);
mkdirSync(outDir, { recursive: true });

// Construction-derived expectations for every AUTOFILLABLE field: accepted
// profile field keys and the exact final DOM value (selected option text for
// selects). Values come from frontend/fixtures/profile-export.example.json.
const EXPECTED = {};
const expect = (number, keys, value) => {
  EXPECTED[`c${String(number).padStart(3, "0")}`] = {
    keys: Array.isArray(keys) ? keys : [keys],
    value,
  };
};
const personal = [
  ["koreanFamilyName", "예시"],
  ["koreanGivenName", "사용자"],
  ["hanjaFamilyName", "例示"],
  ["hanjaGivenName", "使用者"],
  ["englishFamilyName", "Example"],
  ["englishGivenName", "User"],
  ["birthDate", "2000-01-01"],
  ["nationality", "대한민국"],
];
personal.forEach(([key, value], index) =>
  expect(1 + index, `personal.personal.${key}`, value),
);
[
  [10, "email", "example@example.test"],
  [11, "secondaryEmail", "backup@example.test"],
  [13, "phoneNumber", "010-0000-0000"],
  [14, "emergencyPhoneNumber", "010-1111-1111"],
  [15, "residenceCountry", "대한민국"],
  [16, "postalCode", "63309"],
  [17, "addressLine1", "제주특별자치도 제주시 첨단로 242 (영평동)"],
  [18, "addressLine2", "공개 주소 검증"],
].forEach(([number, key, value]) =>
  expect(number, `contact.contact.${key}`, value),
);
const schoolRow = (start, section, values) =>
  values.forEach(([offset, keys, value]) =>
    expect(
      start + offset,
      (Array.isArray(keys) ? keys : [keys]).map((key) =>
        key.includes(".") ? key : `education.${section}.${key}`,
      ),
      value,
    ),
  );
schoolRow(19, "highSchool", [
  [0, "academicProcess", "고등학교"],
  [1, "schoolName", "서울고"],
  [2, "attendanceType", "주간"],
  [3, "completionStatus", "졸업"],
  [4, "schoolRegion", "서울"],
  [5, "startDate", "2016-03-01"],
  [6, "endDate", "2019-02-28"],
]);
schoolRow(28, "university", [
  [
    0,
    [
      "schoolType",
      "degreeLevel",
      "latestEducationType",
      "education.education.latestEducationType",
    ],
    "대학교(학사)",
  ],
  [1, "schoolName", "서울대학교"],
  [2, "attendanceType", "주간"],
  [3, "completionStatus", "졸업"],
  [4, "schoolRegion", "서울"],
  [5, "startDate", "2019-03-01"],
  [6, "endDate", "2023-02-28"],
  [7, "majorName", "컴퓨터공학"],
  [8, "gpaScore", "4.20"],
]);
[
  ["companyName", "예시 주식회사"],
  ["employmentType", "정규"],
  ["startDate", "2023-03-01"],
  ["endDate", "2025-02-28"],
  ["employmentStatus", "퇴사"],
  ["department", "제품개발팀"],
  ["position", "소프트웨어 엔지니어"],
  ["responsibilities", "웹 서비스 기능을 개발하고 품질을 개선했습니다."],
  ["terminationReason", "계약 종료"],
].forEach(([key, value], index) =>
  expect(55 + index, `careers.career.${key}`, value),
);
[
  ["language", "영어"],
  ["testName", "TOEIC"],
  ["registrationNo", "DEMO-EN-001"],
  ["acquisitionDate", "2024-01-15"],
  ["grade", "900"],
].forEach(([key, value], index) =>
  expect(85 + index, `languages.languageTest.${key}`, value),
);
expect(91, "languages.languageSkill.language", "일본어");
[
  ["SQLD(SQL개발자)", "개발자", "DEMO-CERT-001", "한국데이터산업진흥원", "2023-03-01"],
  ["정보처리기사", "기사", "DEMO-CERT-002", "한국산업인력공단", "2023-06-01"],
  ["정보처리산업기사", "산업기사", "DEMO-CERT-003", "한국산업인력공단", "2023-09-01"],
].forEach((row, rowIndex) =>
  ["name", "grade", "registrationNo", "issuer", "acquisitionDate"].forEach(
    (key, index) =>
      expect(
        97 + rowIndex * 5 + index,
        `certifications.certificate.${key}`,
        row[index],
      ),
  ),
);
[
  ["startDate", "2024-01-01"],
  ["endDate", "2024-06-30"],
  ["projectName", "샘플 프로젝트"],
  ["role", "프런트엔드 개발"],
  ["activityDetails", "사용자 프로필 입력 화면과 검증 흐름을 구현했습니다."],
].forEach(([key, value], index) =>
  expect(112 + index, `projects.project.${key}`, value),
);

const sha256 = (path) =>
  createHash("sha256").update(readFileSync(join(ROOT, path))).digest("hex");
const git = (...gitArgs) =>
  execFileSync("git", gitArgs, { cwd: ROOT, encoding: "utf8" }).trim();

const truth = JSON.parse(readFileSync(join(ROOT, TRUTH), "utf8"));
const truthFields = new Map(
  truth.sites[0].fields.map((field) => [field.field_id, field]),
);
const autofillable = [...truthFields.values()]
  .filter((field) => field.classification === "AUTOFILLABLE")
  .map((field) => `c${field.field_id.slice(1)}`)
  .sort();
if (!args.diagnose) {
  const expected = Object.keys(EXPECTED).sort();
  if (JSON.stringify(expected) !== JSON.stringify(autofillable)) {
    throw new Error(
      "Driver expectations differ from the AUTOFILLABLE ground-truth fields",
    );
  }
}

async function providerCalls() {
  if (!args["metrics-url"]) return undefined;
  const text = await (await fetch(args["metrics-url"])).text();
  return text
    .split("\n")
    .filter(
      (line) =>
        line.startsWith("career_form_external_call_seconds_count{") &&
        line.includes(`provider="${provider}"`),
    )
    .reduce((sum, line) => sum + Number(line.split(" ").at(-1)), 0);
}

async function readControls(page) {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll("form input, form select, form textarea"),
      (control) => ({
        id: control.id,
        value:
          control instanceof HTMLSelectElement
            ? control.selectedIndex > 0
              ? control.selectedOptions[0].text.trim()
              : ""
            : control.type === "file"
              ? control.files?.length
                ? "file"
                : ""
              : control.value,
      }),
    ),
  );
}

async function groupRows(page) {
  return page.evaluate(() =>
    Object.fromEntries(
      ["education", "career"].map((group) => [
        group,
        document.querySelectorAll(`.repeat-row[data-row="${group}"]`).length,
      ]),
    ),
  );
}

// Exercises both add buttons on a fresh page: every click must add exactly one
// row with fixed ids, keep existing row values and disable the button at its
// cap. Existing values are filled only in this throwaway context. The check
// query keeps the production workflow unmounted, so this context must not send
// any /api/ request that could reach the backend during measurement.
async function checkAddButtons(browser) {
  const context = await browser.newContext();
  const requests = [];
  context.on("request", (request) => requests.push(request.url()));
  const page = await context.newPage();
  await page.goto(`${args.url}?check=add-buttons`);
  await page.locator("form button.add").first().waitFor({ state: "attached" });
  await page.fill("#c020", "existing-education");
  await page.fill("#c055", "existing-career");
  const clicks = [];
  for (const [group, label, times] of [
    ["education", "학력 추가", 3],
    ["career", "경력 추가", 2],
  ]) {
    const button = page.locator(`form button.add[data-group="${group}"]`);
    for (let click = 1; click <= times; click += 1) {
      const before = (await groupRows(page))[group];
      const enabled = await button.isEnabled();
      if (enabled) await button.click();
      clicks.push({
        group,
        label,
        click,
        enabled_before: enabled,
        rows_before: before,
        rows_after: (await groupRows(page))[group],
        disabled_after: await button.isDisabled(),
      });
    }
  }
  const ids = (await readControls(page))
    .map((item) => item.id)
    .filter((id) => Number(id.slice(1)) >= 132);
  const preserved =
    (await page.inputValue("#c020")) === "existing-education" &&
    (await page.inputValue("#c055")) === "existing-career";
  const newRowsEmpty = await page.evaluate(() =>
    Array.from(document.querySelectorAll("form [id]"))
      .filter((element) => Number(element.id.slice(1)) >= 132)
      .every((element) =>
        element instanceof HTMLSelectElement
          ? element.selectedIndex === 0
          : !element.value,
      ),
  );
  if (args.screenshot)
    await page.screenshot({
      path: join(outDir, "screenshot-add-buttons.png"),
      fullPage: true,
    });
  const panels = await page.locator("career-form-profile-panel").count();
  await context.close();
  const apiRequests = requests.filter((url) =>
    new URL(url).pathname.startsWith("/api/"),
  );
  if (apiRequests.length > 0 || panels > 0) {
    throw new Error(
      `add button check context must not run the workflow: ` +
        `api_requests=${JSON.stringify(apiRequests.map((url) => new URL(url).pathname))} ` +
        `profile_panels=${panels}`,
    );
  }
  const expectedIds = Array.from(
    { length: 28 },
    (_, index) => `c${132 + index}`,
  );
  return {
    clicks,
    dynamic_control_ids: ids,
    ids_match_fixed_numbering:
      JSON.stringify(ids) === JSON.stringify(expectedIds),
    existing_values_preserved: preserved,
    new_rows_empty: newRowsEmpty,
  };
}

async function driveWorkflow(page) {
  const panel = page.locator("career-form-profile-panel");
  const prepare = panel.getByRole("button", { name: "준비하고 계속" });
  const write = panel.getByRole("button", {
    name: /개 항목 기입하기$|^선택하지 않고 계속$/,
  });
  const steps = [];
  const deadline = Date.now() + RUN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await panel.getByRole("heading", { name: "기입 결과" }).count())
      return { status: "RESULT", steps };
    if (await panel.getByText("자동 기입은 완료하지 않았습니다").count()) {
      const title = await panel.locator("h2").first().textContent();
      return { status: "EXCEPTION", reason: title?.trim(), steps };
    }
    if (await panel.getByText("아직 지원하지 않아요").count())
      return { status: "UNSUPPORTED", steps };
    if (await prepare.count()) {
      steps.push("prepare");
      await prepare.click();
      await prepare.waitFor({ state: "detached", timeout: RUN_TIMEOUT_MS });
      continue;
    }
    if (await write.count()) {
      steps.push(`write:${(await write.textContent())?.trim()}`);
      await write.click();
      await write.waitFor({ state: "detached", timeout: RUN_TIMEOUT_MS });
      continue;
    }
    await page.waitForTimeout(200);
  }
  return { status: "TIMEOUT", reason: "workflow did not finish", steps };
}

function fieldAnalysis(events) {
  const domIds = new Map();
  const analyses = new Map();
  for (const event of events) {
    if (event.type !== "AUTOFILL_ANALYZE_FIELDS") continue;
    for (const section of event.request?.sections ?? []) {
      const fields = [
        ...section.fields,
        ...(section.items ?? []).flatMap((item) => item.fields),
      ];
      for (const field of fields) domIds.set(field.candidateId, field.domId);
    }
    for (const field of event.response?.fields ?? [])
      analyses.set(field.candidateId, field);
  }
  return { domIds, analyses };
}

function judge(events, initial, final, retained) {
  const { domIds, analyses } = fieldAnalysis(events);
  const initialValues = new Map(initial.map((item) => [item.id, item.value]));
  const finalValues = new Map(final.map((item) => [item.id, item.value]));
  const retainedValues = new Map(retained.map((item) => [item.id, item.value]));
  const candidates = [];
  for (const [candidateId, domId] of domIds) {
    if (!/^c\d{3}$/.test(domId ?? "")) continue;
    const fieldId = `f${domId.slice(1)}`;
    const field = truthFields.get(fieldId);
    if (!field) throw new Error(`No ground truth for ${domId}`);
    const expected = EXPECTED[domId];
    const analysis = analyses.get(candidateId);
    const binding = analysis?.valueBinding;
    const key = binding?.profileFieldKey ?? analysis?.profileFieldKey;
    const mapped = analysis?.matchType === "MATCH" && key !== undefined;
    const mappingCorrect =
      mapped &&
      field.classification === "AUTOFILLABLE" &&
      expected.keys.includes(key);
    const written = finalValues.get(domId) !== initialValues.get(domId);
    const writeCorrect =
      written &&
      field.classification === "AUTOFILLABLE" &&
      finalValues.get(domId) === expected.value;
    const kept = writeCorrect && retainedValues.get(domId) === expected.value;
    const stages = ["DISCOVERED"];
    if (mapped) stages.push("MAPPED", "BOUND");
    if (mapped && written) stages.push("WRITTEN");
    if (mapped && kept) stages.push("RETAINED");
    let terminal = null;
    let reason = null;
    if (!mapped) {
      terminal = "DEFERRED";
      reason =
        field.classification === "PROFILE_VALUE_MISSING"
          ? "PROFILE_VALUE_MISSING"
          : "MAPPING_NO_MATCH";
    } else if (!mappingCorrect) {
      terminal = "FAILED";
      reason = "MAPPING_INCORRECT";
    } else if (!written) {
      reason =
        analysis.interactionStatus === "READY"
          ? analysis.autofillPolicy === "ALLOWED"
            ? "WRITE_FAILED"
            : "USER_NOT_APPROVED"
          : "WRITE_BLOCKED";
      terminal = reason === "WRITE_FAILED" ? "FAILED" : "DEFERRED";
    } else if (!writeCorrect) {
      terminal = "FAILED";
      reason = "WRITE_FAILED";
    } else if (!kept) {
      terminal = "FAILED";
      reason = "RETENTION_FAILED";
    }
    candidates.push({
      candidate_id: domId,
      field_id: fieldId,
      stages,
      mapping_result: mapped
        ? mappingCorrect
          ? "CORRECT"
          : "INCORRECT"
        : null,
      write_result:
        mapped && written ? (writeCorrect ? "CORRECT" : "INCORRECT") : null,
      terminal_result: terminal,
      reason_code: reason,
      existing_value_changed: false,
    });
  }
  return candidates.sort((left, right) =>
    left.field_id.localeCompare(right.field_id),
  );
}

function mappedKeys(events) {
  const { domIds, analyses } = fieldAnalysis(events);
  return Object.fromEntries(
    [...domIds]
      .filter(([, domId]) => /^c\d{3}$/.test(domId ?? ""))
      .map(([candidateId, domId]) => {
        const analysis = analyses.get(candidateId);
        const binding = analysis?.valueBinding;
        return [
          domId,
          analysis?.matchType === "MATCH"
            ? (binding?.profileFieldKey ?? analysis.profileFieldKey ?? binding?.recipe ?? "MATCH")
            : null,
        ];
      })
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function summary(candidates) {
  const count = (predicate) => candidates.filter(predicate).length;
  return {
    discovered: candidates.length,
    mapped: count((item) => item.mapping_result !== null),
    mapping_correct: count((item) => item.mapping_result === "CORRECT"),
    written: count((item) => item.write_result !== null),
    write_correct: count((item) => item.write_result === "CORRECT"),
    retained_correct: count((item) => item.stages.includes("RETAINED")),
    autofillable: autofillable.length,
  };
}

async function runOnce(browser, index) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  // Analysis requests seen on the network, excluding the execution policy
  // lookup. Each AUTOFILL_* event sends exactly one of them.
  const networkAnalysisRequests = [];
  context.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/v1/") && path !== "/api/v1/execution-policy")
      networkAnalysisRequests.push(path);
  });
  const callsBefore = await providerCalls();
  const started = Date.now();
  await page.goto(args.diagnose ? `${args.url}?diagnose` : args.url);
  await page.locator("career-form-profile-panel").waitFor({ state: "attached" });
  const rowsBefore = await groupRows(page);
  const initial = await readControls(page);
  let outcome;
  try {
    outcome = await driveWorkflow(page);
  } catch (error) {
    outcome = { status: "DRIVER_ERROR", reason: String(error), steps: [] };
  }
  const wallMs = Date.now() - started;
  const final = await readControls(page);
  await page.waitForTimeout(RETENTION_DELAY_MS);
  const retained = await readControls(page);
  const rowsAfter = await groupRows(page);
  const state = await page.evaluate(() => window.__cfBaseline);
  const networkAnalysisCount = networkAnalysisRequests.length;
  if (args.screenshot) {
    await page.screenshot({
      path: join(outDir, `screenshot-${provider}-run${index}.png`),
      fullPage: true,
    });
  }
  await context.close();
  const callsAfter = await providerCalls();
  const analysisEvents = state.events.filter((event) =>
    event.type.startsWith("AUTOFILL_"),
  );
  const finished = analysisEvents.filter((event) => event.endedAt);
  const durationMs = finished.length
    ? Math.round(
        Math.max(...finished.map((event) => event.endedAt)) -
          Math.min(...analysisEvents.map((event) => event.startedAt)),
      )
    : 0;
  const preparationRequests = analysisEvents.filter(
    (event) => event.type === "AUTOFILL_ANALYZE_PREPARATION",
  );
  const fieldRequests = analysisEvents.filter(
    (event) => event.type === "AUTOFILL_ANALYZE_FIELDS",
  );
  const candidates = args.diagnose ? [] : judge(state.events, initial, final, retained);
  const failures = [];
  if (outcome.status !== "RESULT")
    failures.push(`${outcome.status}${outcome.reason ? `: ${outcome.reason}` : ""}`);
  for (const event of analysisEvents.filter((item) => item.ok === false))
    failures.push(`${event.type} failed: ${event.code}`);
  if (fieldRequests.length === 0) failures.push("no field analysis request");
  if (networkAnalysisCount !== analysisEvents.length)
    failures.push(
      `analysis request count mismatch: network=${networkAnalysisCount} events=${analysisEvents.length}`,
    );
  return {
    record: {
      run: index,
      driver_status: outcome.status,
      failure_reasons: failures,
      workflow_steps: outcome.steps,
      page_errors: pageErrors.length + state.pageErrors.length,
      analysis_duration_ms: durationMs,
      wall_ms: wallMs,
      preparation_requests: preparationRequests.length,
      field_requests: fieldRequests.length,
      interaction_requests: analysisEvents.filter(
        (event) => event.type === "AUTOFILL_DECIDE_INTERACTIONS",
      ).length,
      field_responses: fieldRequests.map((event) => ({
        ok: event.ok ?? false,
        analysis_status: event.response?.analysisStatus ?? null,
        warning_codes: event.response?.warningCodes ?? [],
        fields: event.response?.fields?.length ?? 0,
        matches:
          event.response?.fields?.filter((field) => field.matchType === "MATCH")
            .length ?? 0,
      })),
      preparation_plans: preparationRequests.flatMap(
        (event) =>
          event.response?.preparationPlans?.map((plan) => plan.command) ?? [],
      ),
      group_rows_before: rowsBefore,
      group_rows_after: rowsAfter,
      dynamic_control_ids: final
        .map((item) => item.id)
        .filter((id) => Number(id.slice(1)) >= 132),
      provider_calls:
        callsBefore === undefined ? null : callsAfter - callsBefore,
      ...(args.diagnose ? { add_plan_diagnoses: state.diagnoses } : {}),
      ...(args.diagnose
        ? {}
        : { summary: summary(candidates), mapped_keys: mappedKeys(state.events) }),
    },
    candidates,
  };
}

const nearestRankP95 = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(0.95 * sorted.length) - 1];
};

const revision = git("rev-parse", "HEAD");
const productState = git("status", "--porcelain", "--", "frontend/src", "backend/src");
const metadata = {
  schema_version: "1.0",
  revision,
  source_state: productState === "" ? "CLEAN" : "DIRTY",
};
const metadataSha256 = createHash("sha256")
  .update(`${JSON.stringify(metadata)}\n`)
  .digest("hex");

const browser = await chromium.launch({ headless: true });
const runs = [];
let observedCandidates = [];
let addButtonCheck;
try {
  addButtonCheck = await checkAddButtons(browser);
  console.log(`add buttons: ${JSON.stringify(addButtonCheck)}`);
  for (
    let index = 1;
    !args["check-only"] && index <= runCount;
    index += 1
  ) {
    const { record, candidates } = await runOnce(browser, index);
    runs.push(record);
    if (index === 1) observedCandidates = candidates;
    console.log(
      `${provider} run ${index}: ${record.driver_status} ` +
        `analysis_ms=${record.analysis_duration_ms} ` +
        `prep=${record.preparation_requests} fields=${record.field_requests} ` +
        `rows=${JSON.stringify(record.group_rows_before)}->${JSON.stringify(record.group_rows_after)}` +
        (record.summary ? ` summary=${JSON.stringify(record.summary)}` : "") +
        (record.failure_reasons.length
          ? ` failures=${JSON.stringify(record.failure_reasons)}`
          : ""),
    );
  }
} finally {
  await browser.close();
}

if (args["check-only"]) {
  const expectedClicks = [
    ["education", 1, true, 4, 5],
    ["education", 2, true, 5, 6],
    ["education", 3, false, 6, 6],
    ["career", 1, true, 3, 4],
    ["career", 2, false, 4, 4],
  ];
  const clicksMatch =
    JSON.stringify(
      addButtonCheck.clicks.map((click) => [
        click.group,
        click.click,
        click.enabled_before,
        click.rows_before,
        click.rows_after,
      ]),
    ) === JSON.stringify(expectedClicks) &&
    addButtonCheck.clicks.at(-1).disabled_after &&
    addButtonCheck.clicks[2].disabled_after;
  const failed = Object.entries({
    clicks: clicksMatch,
    ids_match_fixed_numbering: addButtonCheck.ids_match_fixed_numbering,
    existing_values_preserved: addButtonCheck.existing_values_preserved,
    new_rows_empty: addButtonCheck.new_rows_empty,
  })
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failed.length > 0)
    throw new Error(`add button check failed: ${failed.join(", ")}`);
  console.log("add button check passed");
  process.exit(0);
}

const config = {
  provider,
  model: args.model,
  timeout_ms: Number(args["timeout-ms"]),
  max_output_tokens: Number(args["max-output-tokens"]),
};
const run = (source, extra) => ({
  site_id: SITE_ID,
  source,
  ...extra,
  ...config,
  profile_version: truth.profile_version,
  initial_state: "EMPTY",
});
const observations = {
  contract_version: "1.1",
  runs: [
    {
      ...run("FIXTURE", {
        status: "MEASURED",
        revision: metadata.source_state === "CLEAN" ? revision : "UNVERIFIED",
        revision_status:
          metadata.source_state === "CLEAN" ? "VERIFIED" : "UNVERIFIED",
        revision_evidence: {
          method: "FIXTURE_SOURCE_METADATA",
          metadata,
          metadata_sha256: metadataSha256,
          unverified_reason:
            metadata.source_state === "CLEAN" ? null : "DIRTY_SOURCE",
        },
      }),
      inconclusive_reason: null,
      usage: {
        provider_calls: runs[0].provider_calls ?? 0,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: null,
        duration_ms: runs[0].analysis_duration_ms,
      },
      candidates: observedCandidates,
    },
    {
      ...run("LIVE_SITE", {
        status: "INCONCLUSIVE",
        revision: "UNVERIFIED",
        revision_status: "UNVERIFIED",
        revision_evidence: {
          method: "UNAVAILABLE",
          metadata: null,
          metadata_sha256: null,
          unverified_reason: "INSTALLATION_UNAVAILABLE",
        },
      }),
      inconclusive_reason: "PAGE_UNAVAILABLE",
      usage: {
        provider_calls: 0,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: null,
        duration_ms: 0,
      },
      candidates: [],
    },
  ],
  follow_up_priorities: [],
};

const driverFiles = readdirSync(DRIVER_DIR)
  .filter((name) => !name.startsWith("."))
  .sort()
  .map((name) => relative(ROOT, join(DRIVER_DIR, name)));
const input = (path) => ({
  path,
  sha256: sha256(path),
  last_commit: git("log", "-1", "--format=%H", "--", path) || null,
});
const timing = {
  measured_revision: revision,
  product_source_state: metadata.source_state,
  collection_tree: git("rev-parse", `HEAD:${COLLECTION_DIR}`),
  collection_files: Object.fromEntries(
    git("ls-files", COLLECTION_DIR)
      .split("\n")
      .filter((path) => !/\.test\.tsx?$/.test(path))
      .map((path) => [path, sha256(path)]),
  ),
  inputs: {
    page: input(PAGE),
    ground_truth: input(TRUTH),
    profile: input(PROFILE),
  },
  driver_files: Object.fromEntries(
    driverFiles.map((path) => [path, sha256(path)]),
  ),
  config,
  measured_at: new Date().toISOString(),
  observation_run: 1,
  add_button_check: addButtonCheck,
  runs,
  analysis_duration_ms: runs.map((item) => item.analysis_duration_ms),
  analysis_duration_p95_ms: nearestRankP95(
    runs.map((item) => item.analysis_duration_ms),
  ),
};

if (!args.diagnose) {
  writeFileSync(
    join(outDir, `observations-${provider}.json`),
    `${JSON.stringify(observations, null, 2)}\n`,
  );
}
writeFileSync(
  join(outDir, `timing-${provider}${args.diagnose ? "-diagnose" : ""}.json`),
  `${JSON.stringify(timing, null, 2)}\n`,
);
console.log(
  `${provider}: ${runs.filter((item) => item.failure_reasons.length === 0).length}/${runCount} runs without failure; ` +
    `p95=${timing.analysis_duration_p95_ms}ms; output=${outDir}`,
);
