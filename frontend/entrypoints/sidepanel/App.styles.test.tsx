import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { createEmptyProfile } from "../../src/profile/model";
import { App } from "./App";

it("keeps panel layout and logo constrained without fetched entry CSS", async () => {
  const externalStyles = [...document.head.querySelectorAll("style")];
  externalStyles.forEach((style) => style.remove());
  try {
    render(
      <App
        inPage
        repository={{
          load: async () => createEmptyProfile(),
          save: async () => undefined,
          loadLayout: async () => "a",
          saveLayout: async () => undefined,
        }}
      />,
    );
    await screen.findByText("내 지원 정보");
    const logo = screen.getByRole("img", { name: "커리어폼" });
    expect(logo).toHaveAttribute("width", "42");
    expect(logo).toHaveAttribute("height", "42");
    expect(getComputedStyle(logo).width).toBe("42px");
    expect(getComputedStyle(logo).height).toBe("42px");
    expect(
      getComputedStyle(logo.closest("header")!.parentElement!).display,
    ).toBe("grid");
  } finally {
    externalStyles.forEach((style) => document.head.append(style));
  }
});
