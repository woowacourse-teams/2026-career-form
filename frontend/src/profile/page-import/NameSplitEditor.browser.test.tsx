import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { within } from "@testing-library/dom";
import { afterEach, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { initialNameParts, NameSplitEditor } from "./NameSplitEditor";

let root: Root;
let host: HTMLElement;
afterEach(() => {
  root?.unmount();
  host?.remove();
});
function Editor() {
  const [parts, setParts] = useState(initialNameParts("남궁민수", "korean"));
  const [confirmed, setConfirmed] = useState(false);
  return (
    <NameSplitEditor
      source="남궁민수"
      language="korean"
      {...parts}
      confirmed={confirmed}
      onChange={(familyName, givenName) => {
        setParts({ familyName, givenName });
        setConfirmed(false);
      }}
      onConfirm={() => setConfirmed(true)}
    />
  );
}
it("moves the actual divider with keyboard and pointer inside the panel shadow root", async () => {
  host = document.createElement("div");
  host.style.width = "360px";
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const container = document.createElement("div");
  shadow.append(container);
  root = createRoot(container);
  root.render(<Editor />);
  const ui = within(container);
  await expect.poll(() => ui.queryByRole("slider")).not.toBeNull();
  const slider = ui.getByRole("slider");
  slider.focus();
  await userEvent.keyboard("{ArrowRight}");
  expect((ui.getByLabelText("국문 성") as HTMLInputElement).value).toBe("남궁");
  expect((ui.getByLabelText("국문 이름") as HTMLInputElement).value).toBe(
    "민수",
  );
  await userEvent.click(ui.getByRole("button", { name: "이름 확인 완료" }));
  expect(ui.getByRole("status").textContent).toContain("확인 완료");
  slider.focus();
  await userEvent.keyboard("{Home}");
  expect((ui.getByLabelText("국문 성") as HTMLInputElement).value).toBe("");
  expect(
    (ui.getByRole("button", { name: "이름 확인 완료" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await userEvent.click(slider);
  expect((ui.getByLabelText("국문 성") as HTMLInputElement).value).toBe("남궁");
  expect(ui.getByRole("status").textContent).toContain("확인 필요");
});
