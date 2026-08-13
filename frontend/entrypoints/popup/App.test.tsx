import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";
import styles from "./App.module.css";

describe("App", () => {
  it("renders the popup landmarks and accessible title", () => {
    render(<App />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("banner").parentElement).toHaveClass(styles.popup);
    expect(
      screen.getByRole("heading", { name: "Career Form" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});
