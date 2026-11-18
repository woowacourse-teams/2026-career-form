import { expect, it, vi } from "vitest";
import { logResumeImport, RESUME_IMPORT_LOG_PREFIX } from "./resume-log";

it("writes one prefixed record with only structural fields", () => {
  const sink = vi.fn();
  logResumeImport(
    {
      stage: "server_request",
      outcome: "ok",
      chars: 3240,
      draftCounts: { personal: 2, education: 1 },
    },
    sink,
  );
  expect(sink).toHaveBeenCalledWith(
    RESUME_IMPORT_LOG_PREFIX,
    "server_request",
    {
      outcome: "ok",
      chars: 3240,
      draftCounts: { personal: 2, education: 1 },
    },
  );
});

it("drops anything that is not a known count or code", () => {
  const sink = vi.fn();
  logResumeImport(
    {
      stage: "text_extract",
      outcome: "failed",
      reason: "no_text",
      fileType: "pdf",
      chars: 0,
      // Values a careless caller might pass must never be written.
      ...({ text: "합성 이력서 본문", fileName: "이력서.pdf" } as object),
      draftCounts: { personal: 1, 합성값: 3 } as Record<string, number>,
    },
    sink,
  );
  const written = JSON.stringify(sink.mock.calls);
  expect(written).not.toContain("합성");
  expect(written).not.toContain("이력서");
  expect(sink.mock.calls[0][2]).toEqual({
    outcome: "failed",
    reason: "no_text",
    fileType: "pdf",
    chars: 0,
    draftCounts: { personal: 1 },
  });
});

it("ignores a reason outside the fixed codes", () => {
  const sink = vi.fn();
  logResumeImport(
    { stage: "save", outcome: "failed", reason: "합성값" as never },
    sink,
  );
  expect(sink.mock.calls[0][2]).toEqual({ outcome: "failed" });
});
