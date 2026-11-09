import { expect, it } from "vitest";
import { semanticText } from "./semantic-context";

it("keeps 등록번호 in the semantic vocabulary after the certificate label change", () => {
  expect(semanticText("등록번호")).toBe("등록번호");
  expect(semanticText("자격증 등록번호")).toBe("자격증 등록번호");
  expect(semanticText("등록번호 및 자격번호")).toContain("등록번호");
});
