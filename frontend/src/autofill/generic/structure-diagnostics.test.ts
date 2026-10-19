import { describe, expect, it } from "vitest";

import type { StructureLoopAction } from "./structure-loop";
import {
  blockedReasonText,
  createStructureDiagnostics,
  structureActionLine,
  structureConsoleLine,
  structureStatusText,
} from "./structure-diagnostics";

const done: StructureLoopAction = {
  kind: "ADD_ROW",
  sectionTitle: "합성 섹션 제목",
  result: "done",
  rowIndex: 1,
};
const blocked: StructureLoopAction = {
  kind: "REVEAL_SECTION",
  sectionTitle: "막힌 합성 섹션",
  result: "blocked",
  reason: "NO_ADD_CONTROL",
};

describe("structure loop diagnostics", () => {
  it("tells the three states apart", () => {
    expect(createStructureDiagnostics(false, []).status).toBe("not-run");
    expect(createStructureDiagnostics(true, []).status).toBe("ran-no-actions");
    expect(createStructureDiagnostics(true, [done]).status).toBe(
      "ran-with-actions",
    );
  });

  it("uses a distinct fixed sentence per state", () => {
    const texts = (
      ["not-run", "ran-no-actions", "ran-with-actions"] as const
    ).map(structureStatusText);
    expect(new Set(texts).size).toBe(3);
    expect(texts[0]).toContain("구조 자동 준비 미실행");
    expect(texts[1]).toContain("실행했고 필요한 행동 없음");
  });

  it("replaces reason codes with fixed Korean text", () => {
    expect(blockedReasonText("NO_ADD_CONTROL")).not.toContain("NO_ADD_CONTROL");
    expect(blockedReasonText("SOMETHING_NEW_AND_UNKNOWN")).toBe(
      blockedReasonText(undefined),
    );
    expect(blockedReasonText("executor:profile-value-123")).toBe(
      blockedReasonText(undefined),
    );
  });

  it("describes actions with kind, section title and result", () => {
    expect(structureActionLine(done)).toMatchObject({
      sectionTitle: "합성 섹션 제목",
      resultText: "완료",
    });
    const line = structureActionLine(blocked);
    expect(line.resultText).toBe("막힘");
    expect(line.reasonText).toBe(blockedReasonText("NO_ADD_CONTROL"));
    expect(JSON.stringify(line)).not.toContain("NO_ADD_CONTROL");
  });

  it("keeps section titles and codes out of the console line", () => {
    const line = structureConsoleLine(
      createStructureDiagnostics(true, [done, blocked, done]),
    );
    expect(line).toContain("ran-with-actions");
    expect(line).toContain("완료 2");
    expect(line).toContain("막힘 1");
    expect(line).not.toContain("합성 섹션 제목");
    expect(line).not.toContain("막힌 합성 섹션");
    expect(line).not.toContain("NO_ADD_CONTROL");
  });
});
