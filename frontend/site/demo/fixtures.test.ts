import { describe, expect, it } from "vitest";
import { createDemoRepository, demoAnalysisClient } from "./fixtures";
import type { FieldsAnalyzeRequest } from "../../src/autofill/api/types";

describe("isolated example data", () => {
  it("never persists changes or exposes shared mutable profile state", async () => {
    const repo = createDemoRepository();
    const first = await repo.load();
    first.personal.koreanGivenName = "changed";
    await repo.save(first);
    expect((await repo.load()).personal.koreanGivenName).toBe("커리어");
  });
  it("maps only recognized example inputs and ignores unrelated fields", async () => {
    const request: FieldsAnalyzeRequest = {
      schemaVersion: 2,
      snapshotId: "fixture",
      site: { host: "example.invalid", pathPattern: "/" },
      sections: [
        {
          sectionId: "basic",
          fields: [
            {
              candidateId: "known",
              domId: "school",
              visibility: "visible",
              element: "input",
              control: "text",
            },
            {
              candidateId: "unknown",
              domId: "password",
              visibility: "visible",
              element: "input",
              control: "text",
            },
          ],
        },
      ],
    };
    const response = await demoAnalysisClient.analyzeFields(request);
    expect(response.fields).toEqual([
      expect.objectContaining({
        candidateId: "known",
        valueBinding: {
          type: "DIRECT",
          profileFieldKey: "education.university.schoolName",
        },
      }),
    ]);
  });
});
