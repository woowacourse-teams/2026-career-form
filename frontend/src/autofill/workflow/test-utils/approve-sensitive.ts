import { fireEvent, screen, waitFor } from "@testing-library/react";

function continueButton() {
  return (
    screen.queryByRole("button", { name: "준비하고 계속" }) ??
    screen.queryByRole("button", {
      name: /^(\d+개 항목 기입하기|선택하지 않고 계속)$/,
    })
  );
}

/** Only tests that retain sensitive confirmation may call this helper. */
export async function approveCurrentSensitiveReview(): Promise<void> {
  await waitFor(() => {
    if (!continueButton()) throw new Error("Sensitive review is not ready");
  });
  const revealButtons = screen.queryAllByRole("button", { name: / 값 보기$/ });
  if (revealButtons.length === 0)
    throw new Error("No sensitive values require explicit confirmation");
  for (const button of revealButtons) fireEvent.click(button);
  const includeButtons = screen.queryAllByRole("button", {
    name: / 포함하기$/,
  });
  if (includeButtons.length === 0)
    throw new Error("Sensitive values could not be included after reveal");
  for (const button of includeButtons) fireEvent.click(button);

  const button = continueButton();
  if (!button) throw new Error("Confirmation action disappeared");
  fireEvent.click(button);
}

/** Explicitly authorize each synthetic field, including newly revealed detail reviews. */
export async function approveSensitiveWorkflow(): Promise<void> {
  for (let stage = 0; stage < 8; stage++) {
    const next = await waitFor(
      () => {
        if (continueButton()) return "review";
        if (screen.queryByRole("button", { name: "수동 복사로 돌아가기" }))
          return "finished";
        throw new Error("Workflow is still analyzing");
      },
      { timeout: 5000 },
    );
    if (next === "finished") return;
    await approveCurrentSensitiveReview();
  }
  throw new Error("Workflow did not settle after eight explicit review rounds");
}
