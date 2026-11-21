import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AutofillWorkflow } from "../../workflow/AutofillWorkflow";
import type { FieldsAnalyzeRequest } from "../../api/types";
import { resetHplacePage } from "../../workflow/test-utils/hplace.fixture";
import {
  dateInput,
  dropdownTrigger,
  mountV1Step1,
  named,
  selectedToggle,
  v1Analysis,
  v1Profile,
} from "./v1-basic.test-fixtures";

afterEach(resetHplacePage);

it("runs the status drivers, then their dependents, within the Hplace budget", async () => {
  const page = mountV1Step1();
  const profile = v1Profile();
  const requests: FieldsAnalyzeRequest[] = [];
  const analyzeFields = vi.fn(async (request: FieldsAnalyzeRequest) => {
    requests.push(request);
    return v1Analysis(request);
  });
  render(
    <AutofillWorkflow
      pageDocument={document}
      onExit={() => undefined}
      repository={{ load: async () => profile }}
      apiClient={{
        loadExecutionPolicy: async () => undefined,
        analyzePreparation: async (r) => ({
          snapshotId: r.snapshotId,
          mode: "ADAPTER",
          analysisStatus: "COMPLETE",
          preparationPlans: [],
        }),
        analyzeFields,
      }}
    />,
  );
  expect(await screen.findByText("기입 결과")).toBeVisible();
  expect(analyzeFields.mock.calls.length).toBeLessThanOrEqual(3);
  expect(requests[0].sections[0].fields.map((f) => f.domName)).not.toContain(
    "hplace.v1.serviceStartDate",
  );
  expect(requests.at(-1)!.sections[0].fields.map((f) => f.domName)).toContain(
    "hplace.v1.serviceStartDate",
  );
  expect(selectedToggle("병역")).toEqual(["군필"]);
  expect(selectedToggle("장애여부")).toEqual(["대상"]);
  expect(selectedToggle("보훈여부")).toEqual(["대상"]);
  expect(dateInput("입대일").value).toBe("2010.03");
  expect(dateInput("YYYY.MM.DD").value).toBe("1990.01.31");
  expect(dropdownTrigger("rank").textContent).toBe("병장");
  expect(dropdownTrigger("relation").textContent).toBe("부");
  expect(
    named(
      "preferentialEmploymentGroupResumeItemAnswers.handicapAnswer.handicapRegistrationNumber",
    ).value,
  ).toBe("1234-5678");
  expect(document.querySelector("#dropdown-body")).toBeNull();
  expect(page.forbiddenClicks()).toEqual([]);
});
