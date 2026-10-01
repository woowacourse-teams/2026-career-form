import { expect, it } from "vitest";

import {
  CandidateRegistry,
  createStructuralSignature,
} from "./candidate-registry";

it("requires an exact stable action DOM ID during identity re-identification", () => {
  const licence = document.createElement("button");
  licence.textContent = "추가";
  const overseas = document.createElement("button");
  overseas.textContent = "추가";
  document.body.append(licence, overseas);
  const registry = new CandidateRegistry();
  registry.registerAction({
    kind: "action",
    candidateId: "licence-after-rerender",
    candidate: {
      candidateId: "licence-after-rerender",
      element: "button",
      control: "button",
      visibility: "visible",
      displayName: "추가",
      domId: "hyundai:add:licence",
    },
    element: licence,
    sectionId: "section-licence-after-rerender",
    signature: createStructuralSignature([licence]),
  });
  registry.registerAction({
    kind: "action",
    candidateId: "overseas-after-rerender",
    candidate: {
      candidateId: "overseas-after-rerender",
      element: "button",
      control: "button",
      visibility: "visible",
      displayName: "추가",
    },
    element: overseas,
    sectionId: "section-overseas-after-rerender",
    signature: createStructuralSignature([overseas]),
  });

  expect(
    registry.lookupActionByIdentity({
      sectionId: "section-licence-before-rerender",
      displayName: "추가",
      domId: "hyundai:add:licence",
    }),
  ).toMatchObject({
    status: "ready",
    handle: { candidate: { candidateId: "licence-after-rerender" } },
  });
});
