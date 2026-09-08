import { describe, expect, it } from "vitest";
import { validatePreparationResponse } from "../api/validate-response";
const request = {
  schemaVersion: 2 as const,
  snapshotId: "p",
  site: { host: "www.skcareers.com", pathPattern: "/Application/Index/:id" },
  sections: [
    {
      sectionId: "s",
      actionCandidates: [
        {
          candidateId: "a",
          element: "button" as const,
          control: "button" as const,
          visibility: "visible" as const,
          domId: "btnSearchAddress",
        },
      ],
    },
  ],
};
const response = {
  snapshotId: "p",
  mode: "ADAPTER",
  analysisStatus: "COMPLETE",
  preparationPlans: [
    {
      actionCandidateId: "a",
      command: "SEARCH_ADDRESS",
      expectedEffect: "ADDRESS_SELECTED",
    },
  ],
};
describe("negotiated preparation address command", () => {
  it("accepts the exact SK search action", () =>
    expect(validatePreparationResponse(request, response)).toEqual(response));
  it("rejects generic, foreign, stale, disabled and executable payloads", () => {
    for (const invalid of [
      { ...response, mode: "GENERIC" },
      { ...response, snapshotId: "old" },
      {
        ...response,
        preparationPlans: [{ ...response.preparationPlans[0], script: "x" }],
      },
    ])
      expect(() => validatePreparationResponse(request, invalid)).toThrow();
    expect(() =>
      validatePreparationResponse(
        { ...request, site: { ...request.site, host: "example.test" } },
        response,
      ),
    ).toThrow();
    expect(() =>
      validatePreparationResponse(
        {
          ...request,
          sections: [
            {
              ...request.sections[0],
              actionCandidates: [
                { ...request.sections[0].actionCandidates[0], disabled: true },
              ],
            },
          ],
        },
        response,
      ),
    ).toThrow();
  });
});
