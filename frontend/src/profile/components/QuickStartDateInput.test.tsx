import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatDateDraft, QuickStartDateInput } from "./QuickStartDateInput";

function renderInput(initial = "") {
  const saved = vi.fn();
  function Host() {
    const [value, setValue] = useState(initial);
    return (
      <QuickStartDateInput
        label="생년월일"
        value={value}
        onChange={(next) => {
          saved(next);
          setValue(next);
        }}
      />
    );
  }
  render(<Host />);
  const input = screen.getByLabelText("생년월일", { exact: true });
  return { input, saved };
}
// Types or deletes one character at a time, the way a keyboard would.
function typeEach(input: HTMLElement, text: string) {
  for (const character of text)
    fireEvent.change(input, {
      target: { value: (input as HTMLInputElement).value + character },
    });
}

describe("QuickStartDateInput", () => {
  it("숫자를 한 자씩 입력하면 연과 월 뒤에 대시가 들어가 날짜가 된다", () => {
    const { input, saved } = renderInput();
    typeEach(input, "2000");
    expect(input).toHaveValue("2000-");
    typeEach(input, "02");
    expect(input).toHaveValue("2000-02-");
    typeEach(input, "23");
    expect(input).toHaveValue("2000-02-23");
    expect(saved).toHaveBeenLastCalledWith("2000-02-23");
  });
  it("끝에서부터 지울 때 대시에서 막히지 않고 모두 지울 수 있다", () => {
    const { input, saved } = renderInput("2000-02-23");
    const seen: string[] = [];
    for (let length = 9; length >= 0; length -= 1) {
      fireEvent.change(input, {
        target: { value: (input as HTMLInputElement).value.slice(0, -1) },
      });
      seen.push((input as HTMLInputElement).value);
      expect(seen.at(-1)).toHaveLength(length);
    }
    expect(input).toHaveValue("");
    expect(saved).toHaveBeenLastCalledWith("");
  });
  it("대시를 직접 넣거나 8자리를 붙여넣어도 같은 값으로 저장한다", () => {
    const typed = renderInput();
    typeEach(typed.input, "2000-02-23");
    expect(typed.input).toHaveValue("2000-02-23");
    expect(typed.saved).toHaveBeenLastCalledWith("2000-02-23");
  });
  it("8자리 붙여넣기와 달력 선택은 그대로 받는다", () => {
    const pasted = renderInput();
    fireEvent.change(pasted.input, { target: { value: "20000223" } });
    expect(pasted.input).toHaveValue("2000-02-23");
    expect(pasted.saved).toHaveBeenLastCalledWith("2000-02-23");
  });
  it("덜 입력한 날짜는 저장하지 않고 안내와 예시가 같은 입력 방법을 말한다", () => {
    const { input, saved } = renderInput();
    expect(input).toHaveAttribute("placeholder", "YYYY-MM-DD");
    typeEach(input, "200002");
    fireEvent.blur(input);
    expect(saved).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "숫자 8자리를 입력하면 2024-03-02처럼 바뀌어요",
    );
  });
});

describe("formatDateDraft", () => {
  it.each([
    ["2000", "200", "2000-"],
    ["2000", "2000-", "2000"],
    ["2000-0", "2000-", "2000-0"],
    ["200002", "20000", "2000-02-"],
    ["2000-02", "2000-02-", "2000-02"],
    ["20000223", "", "2000-02-23"],
    ["2000/02", "2000/0", "2000/02"],
    ["200002231", "2000-02-23", "200002231"],
    ["", "2", ""],
  ])("%j (이전 %j) → %j", (raw, previous, expected) => {
    expect(formatDateDraft(raw, previous)).toBe(expected);
  });
});
