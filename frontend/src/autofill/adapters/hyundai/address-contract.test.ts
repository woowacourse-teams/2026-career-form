import { expect, it } from "vitest";
import { validatePreparationResponse } from "../../api/validate-response";
const request = {
  schemaVersion: 2 as const,
  snapshotId: "p",
  site: { host: "talent.hyundai.com", pathPattern: "/apply/applyWrite.hc" },
  sections: [
    {
      sectionId: "s",
      actionCandidates: [
        {
          candidateId: "a",
          domId: "hyundai:search:address",
          domName: "postCd",
          element: "input" as const,
          control: "button" as const,
          visibility: "visible" as const,
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
it("accepts only the exact Hyundai search action and route", () => {
  expect(validatePreparationResponse(request, response)).toEqual(response);
  for (const site of [
    { host: "example.test", pathPattern: "/apply/applyWrite.hc" },
    { host: "talent.hyundai.com", pathPattern: "/other" },
  ])
    expect(() =>
      validatePreparationResponse({ ...request, site }, response),
    ).toThrow();
  for (const patch of [
    { domName: "addr" },
    { domId: "postCd" },
    { element: "button" as const },
    { disabled: true as const },
    { readonly: true as const },
  ])
    expect(() =>
      validatePreparationResponse(
        {
          ...request,
          sections: [
            {
              ...request.sections[0],
              actionCandidates: [
                { ...request.sections[0].actionCandidates[0], ...patch },
              ],
            },
          ],
        },
        response,
      ),
    ).toThrow();
});
