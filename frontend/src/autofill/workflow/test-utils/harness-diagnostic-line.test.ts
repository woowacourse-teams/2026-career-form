import { expect, it } from "vitest";
import {
  expectHarnessLine,
  harnessDiagnosticLine,
} from "./harness-diagnostic-line";

it("keeps the harness grammar for build, step, stage and skip lines", () => {
  for (const line of [
    `[CareerForm] build revision=${"a".repeat(40)} source_state=CLEAN`,
    "[CareerForm] 4. 기입 실행 (planned 3)",
    "[CareerForm] stage name=preparation-majors collected=0 planned=2 executed=1",
    "[CareerForm] skip stage=write key=hplace.mrs2.college.academyName reason=no-response detail=committed-search-no-response failureCode=SEARCH_TIMEOUT",
  ])
    expectHarnessLine(line);
});

it("drops lines the live harness would not persist", () => {
  for (const line of [
    `[CareerForm] build revision=${"a".repeat(40)} source_state=DIRTY`,
    "[CareerForm] stage name=drivers planned=1 written=1",
    "[CareerForm] stage name=Drivers planned=1",
    "[CareerForm] skip stage=write key=college[0].academyName reason=disabled detail=x",
    "[CareerForm] skip stage=write key=hplace.mrs2.x reason=disabled label=x",
    "[CareerForm] skip stage=write key=hplace.mrs2.x detail=x",
    "[CareerForm] skip stage=write key=hplace.mrs2.x reason=disabled detail=a b",
  ])
    expect(harnessDiagnosticLine(line)).toBeNull();
  expect(harnessDiagnosticLine({ line: "x" })).toBeNull();
  expect(() =>
    expectHarnessLine("[CareerForm] stage name=drivers written=1"),
  ).toThrow();
});

it("rejects canary values even when the grammar would keep the line", () => {
  expect(() =>
    expectHarnessLine(
      "[CareerForm] skip stage=write key=hplace.mrs2.x reason=disabled detail=CANARY_A",
      ["CANARY_A"],
    ),
  ).toThrow();
});
