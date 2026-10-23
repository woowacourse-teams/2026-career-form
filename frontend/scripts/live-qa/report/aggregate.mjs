// Turns a judged page into metrics and renders the markdown report.
//
// Denominator = correct + wrong + missed. It includes cells of rows the run
// created, and `uncreatedCells` for rows the run should have created but did
// not (otherwise a missing row would raise the rate). Controls whose final
// value cannot be checked (a pre-run value that stayed) are a separate judge
// kind, `unverifiable`: reported, never part of the denominator. The app's own panel counts
// are kept next to it for comparison; they count items, not controls.

// Fields the Hplace adapter leaves out on purpose (llm-wiki adapter-field-inventory):
// the college category, day/night of the extra majors, the language exam date
// and the resident-registration address (the adapter fills the current
// address only).
export const HPLACE_POLICY_EXCLUSIONS =
  /collegeCategoryCode|collegeMajor\[[12]\]\.dayOrNight|examDate|residentAddress\./;

// Judge kinds that take an AUTOFILLABLE control out of `correct`.
const NOT_CORRECT = ["WRONG", "MISSED", "EXPECTATION_ERROR", "UNVERIFIABLE"];
const REF_INDEX = /^i=(\d+)(?:\s|$)/;

// Recounts every total of a verdict from its items and the joined rows. The
// model's numbers are not trusted (two 2026-10-22 verdicts disagreed with
// their own items); fields that differ are listed in `mismatches`.
export function recountVerdict(verdict, joined) {
  const items = verdict.items ?? [];
  const autofillableRows = {};
  let autofillable = 0;
  for (const r of joined.rows ?? [])
    if (r.category === "AUTOFILLABLE") {
      autofillable++;
      autofillableRows[r.i] = true;
    }
  const count = (kind) => items.filter((it) => it.kind === kind).length;
  // An AUTOFILLABLE control is correct unless an item says otherwise; the
  // same control in two items still counts once.
  const notCorrect = {};
  for (const it of items) {
    if (!NOT_CORRECT.includes(it.kind)) continue;
    const i = REF_INDEX.exec(it.ref ?? "")?.[1];
    if (i !== undefined && autofillableRows[i]) notCorrect[i] = true;
  }
  const extraCorrect = count("EXTRA_CORRECT");
  const extraWrong = count("EXTRA_WRONG");
  const recount = {
    autofillable,
    correct: autofillable - Object.keys(notCorrect).length,
    wrong: count("WRONG"),
    missed: count("MISSED"),
    expectationErrors: count("EXPECTATION_ERROR"),
    unverifiable: count("UNVERIFIABLE"),
    extraWritten: extraCorrect + extraWrong,
    extraCorrect,
    extraWrong,
    // Expected rows come from the pre-grading; observed rows stay the
    // judge's reading of the new controls.
    createdRowsExpected: Array.isArray(joined.rowExpansion)
      ? joined.rowExpansion.reduce((a, r) => a + (r.extraRowsExpected ?? 0), 0)
      : (verdict.createdRowsExpected ?? 0),
    createdRowsObserved: verdict.createdRowsObserved ?? 0,
  };
  const mismatches = [];
  for (const [field, value] of Object.entries(recount))
    if (
      field !== "createdRowsObserved" &&
      verdict[field] !== undefined &&
      verdict[field] !== value
    )
      mismatches.push(
        `verdict-mismatch:${field} model=${verdict[field]} recount=${value}`,
      );
  return { ...recount, mismatches };
}

export function aggregatePage({
  label,
  joined,
  verdict,
  run,
  uncreatedCells = 0,
  policyPattern = null,
}) {
  const panel = run?.panel ?? null;
  const guardFailed = run?.guard?.passed === false;
  const base = {
    label,
    pageControls: joined.rows.length,
    addedControls: joined.addedOrUnmatchedAfterControls.length,
    stage: panel?.stage ?? null,
    error: guardFailed ? "guard-failed" : (run?.error?.code ?? null),
    revision: run?.build?.revision ?? null,
    panelCompleted: panel?.counts?.completed ?? null,
    panelReview: panel?.counts?.needsReview ?? null,
    // Custom widgets the clear step could not empty (rows may look existing).
    widgetsLeft: (run?.cleared ?? []).reduce(
      (a, c) => a + (c?.widgetsLeft ?? 0),
      0,
    ),
  };
  // A run whose guard blocked a site action is not a valid measurement.
  if (!verdict || guardFailed) return { ...base, measured: false };
  const model = verdict;
  verdict = { ...model, ...recountVerdict(model, joined) };
  const unverifiable = verdict.unverifiable;
  // `uncreatedCells` is a number or {cells, policyCells}.
  const given =
    typeof uncreatedCells === "object" && uncreatedCells
      ? uncreatedCells
      : { cells: uncreatedCells ?? 0, policyCells: 0 };
  const warnings = [...verdict.mismatches];
  let estimatedUncreated = 0;
  const shortRows = verdict.createdRowsExpected - verdict.createdRowsObserved;
  if (shortRows > 0 && !given.cells) {
    // Not given: estimate from the pre-grading's expected rows (average
    // fillable cells per expected row), so the rate is not inflated.
    const expansion = joined.rowExpansion ?? [];
    const rows = expansion.reduce((a, r) => a + (r.extraRowsExpected ?? 0), 0);
    const cells = expansion.reduce(
      (a, r) => a + (r.extraRowsExpected ?? 0) * (r.autofillablePerRow ?? 0),
      0,
    );
    estimatedUncreated = rows > 0 ? Math.round((shortRows * cells) / rows) : 0;
    warnings.push(
      `rows-not-created:${verdict.createdRowsExpected}>${verdict.createdRowsObserved}${estimatedUncreated ? ` (추정 ${estimatedUncreated}칸)` : ""}`,
    );
  }
  const correct = verdict.correct + verdict.extraCorrect;
  const wrong = verdict.wrong + verdict.extraWrong;
  const missed = verdict.missed + given.cells + estimatedUncreated;
  const denominator = correct + wrong + missed;
  const policyMissed =
    (policyPattern
      ? verdict.items.filter(
          (it) => it.kind === "MISSED" && policyPattern.test(it.ref),
        ).length
      : 0) + (policyPattern ? (given.policyCells ?? 0) : 0);
  return {
    ...base,
    measured: true,
    written: correct + wrong,
    correct,
    wrong,
    missed,
    uncreatedCells: given.cells,
    estimatedUncreated,
    unverifiable,
    expectationErrors: verdict.expectationErrors,
    denominator,
    policyApplies: Boolean(policyPattern),
    policyMissed,
    rate: denominator > 0 ? (correct / denominator) * 100 : null,
    policyRate:
      denominator - policyMissed > 0
        ? (correct / (denominator - policyMissed)) * 100
        : null,
    rowsExpected: verdict.createdRowsExpected,
    rowsObserved: verdict.createdRowsObserved,
    warnings,
    missedRefs: verdict.items
      .filter((it) => it.kind === "MISSED")
      .map((it) => it.ref),
  };
}

const pct = (n) =>
  n === null || !Number.isFinite(n) ? "—" : `${n.toFixed(1)}%`;

export function renderReport({ title, meta, pages, names = {} }) {
  const revisions = [
    ...new Set(pages.map((p) => p.revision).filter(Boolean)),
  ].map((r) => `\`${String(r).slice(0, 7)}\``);
  const lines = [
    `# ${title}`,
    "",
    `- 빌드(측정 당시): ${revisions.length ? revisions.join(", ") : "기록 없음"}${revisions.length > 1 ? " ⚠ 페이지마다 다름" : ""}`,
    `- API: \`${meta.apiOrigin}\``,
    `- 측정일: ${meta.date}`,
    "",
    "| 페이지 | 화면 전체 칸 (전+신규) | 입력 가능 칸 | 확장이 입력 | 정답 | 오입력 | 누락 | 입력률 | 정책 반영 | 행 (기대/생성) | 앱 패널 | 비고 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const p of pages) {
    const name = names[p.label] ?? p.label;
    const total = `${p.pageControls + p.addedControls} (${p.pageControls}+${p.addedControls})`;
    const panel =
      p.panelCompleted === null
        ? (p.stage ?? "—")
        : `${p.panelCompleted} / ${p.panelReview}`;
    const notes = [
      p.error ? `⚠ ${p.error}` : "",
      p.widgetsLeft ? `⚠ 비우지 못한 위젯 ${p.widgetsLeft}` : "",
      ...(p.warnings ?? []).map((w) => `⚠ ${w}`),
      p.unverifiable ? `확인 불가 ${p.unverifiable}` : "",
      p.expectationErrors ? `채점 오류 ${p.expectationErrors}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    if (!p.measured) {
      lines.push(
        `| ${name} | ${total} | 측정 안 됨 | — | — | — | — | — | — | — | ${panel} | ${notes} |`,
      );
      continue;
    }
    lines.push(
      `| ${name} | ${total} | ${p.denominator} | ${p.written} | ${p.correct} | ${p.wrong} | ${p.missed} | ${pct(p.rate)} | ${p.policyApplies ? pct(p.policyRate) : "—"} | ${p.rowsExpected}/${p.rowsObserved} | ${panel} | ${notes} |`,
    );
  }
  const measured = pages.filter((p) => p.measured);
  const sum = (k, list = measured) => list.reduce((a, p) => a + p[k], 0);
  if (measured.length) {
    const denominator = sum("denominator");
    const policy = measured.filter((p) => p.policyApplies);
    const policyDenominator =
      sum("denominator", policy) - sum("policyMissed", policy);
    lines.push(
      `| **합계** | | ${denominator} | ${sum("written")} | ${sum("correct")} | ${sum("wrong")} | ${sum("missed")} | ${pct(denominator > 0 ? (sum("correct") / denominator) * 100 : null)} | ${policy.length && policyDenominator > 0 ? pct((sum("correct", policy) / policyDenominator) * 100) : "—"} | | | |`,
    );
  }
  lines.push(
    "",
    "- 입력 가능 칸 = 정답 + 오입력 + 누락(새 행과 만들어지지 않은 행의 칸 포함). 확인 불가(실행 전 값이 그대로 남아 비교할 수 없는 칸)는 따로 센다.",
    "- 정책 반영 = 에이치닷에서 위키에 문서화된 의도적 미지원 칸을 뺀 입력률(합계는 에이치닷 페이지만).",
    "- 앱 패널 = 결과 화면의 `입력 완료 / 확인 필요`(항목 단위).",
  );
  return lines.join("\n") + "\n";
}
