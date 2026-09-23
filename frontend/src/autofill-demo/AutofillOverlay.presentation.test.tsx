import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { AutofillWorkflow } from "../autofill/workflow/AutofillWorkflow";
import { AutofillOverlay } from "./AutofillOverlay";
import {
  createApiClient,
  createRepository,
} from "./AutofillOverlay.test-fixtures";

function application() {
  const section = document.createElement("section");
  section.innerHTML =
    '<label>이메일<input name="email" style="background-color: red"></label>';
  document.body.append(section);
  const input = section.querySelector("input")!;
  let top = 1200;
  // jsdom has no layout/scrolling; model the browser's viewport boundary.
  input.getBoundingClientRect = () => new DOMRect(20, top, 200, 30);
  input.scrollIntoView = () => {
    top = 300;
  };
  const observed: Array<{ top: number; background: string; outline: string }> =
    [];
  input.addEventListener("input", () =>
    observed.push({
      top,
      background: input.style.backgroundColor,
      outline: input.style.outline,
    }),
  );
  return { section, input, observed, top: () => top };
}

it.each(["workflow", "overlay"])(
  "fills through the default %s without scrolling or highlighting even during input",
  async (entry) => {
    const page = application();
    try {
      const api = createApiClient();
      const props = {
        apiClient: {
          ...api,
          async analyzeFields(
            request: Parameters<typeof api.analyzeFields>[0],
          ) {
            const response = await api.analyzeFields(request);
            return {
              ...response,
              mode: "ADAPTER" as const,
              fields: response.fields.map((field) => ({
                ...field,
                mappingStatus: "ADAPTER_VERIFIED" as const,
              })),
            };
          },
        },
        repository: createRepository(),
        pageDocument: document,
      };
      render(
        entry === "overlay" ? (
          <AutofillOverlay {...props} onClose={() => {}} />
        ) : (
          <AutofillWorkflow {...props} onExit={() => {}} />
        ),
      );

      await screen.findByRole("heading", { name: "자동 기입을 마쳤어요" });
      expect(page.input).toHaveValue("me@example.test");
      expect(page.observed.length).toBeGreaterThan(0);
      for (const state of page.observed) {
        expect(state).toEqual({ top: 1200, background: "red", outline: "" });
      }
      expect(page.top()).toBe(1200);
      expect(page.input.style.backgroundColor).toBe("red");
      expect(screen.getByLabelText("입력 완료 1개")).toBeInTheDocument();
    } finally {
      page.section.remove();
    }
  },
);

it("locates a review field only when its result action is clicked", async () => {
  const page = application();
  page.input.value = "existing@example.test";
  try {
    render(
      <AutofillOverlay
        apiClient={createApiClient()}
        repository={createRepository()}
        pageDocument={document}
        onClose={() => {}}
      />,
    );
    await screen.findByRole("heading", { name: "자동 기입을 마쳤어요" });
    expect(page.top()).toBe(1200);
    expect(page.input.style.backgroundColor).toBe("red");
    fireEvent.click(
      screen.getByRole("button", { name: /이메일.*필드로 이동/ }),
    );
    expect(page.top()).toBe(300);
    expect(page.input).toHaveValue("existing@example.test");
  } finally {
    page.section.remove();
  }
});
