import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { App } from "./App";

it("opens real profile management without collecting profile values", async () => {
  let opened = false;
  let closed = false;
  render(
    <App
      openOptions={async () => {
        opened = true;
      }}
      close={() => {
        closed = true;
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "프로필 관리 열기" }));
  expect(opened).toBe(true);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "나중에 할게요" }));
  expect(closed).toBe(true);
});
it("allows retry when profile management cannot open", async () => {
  let attempts = 0;
  render(
    <App
      openOptions={async () => {
        attempts++;
        if (attempts === 1) throw new Error("unavailable");
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "프로필 관리 열기" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "프로필 관리 열기" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(attempts).toBe(2);
});
