import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { initialNameParts, NameSplitEditor } from "./NameSplitEditor";

function Editor({
  source = "남궁민수",
  language = "korean" as "korean" | "english",
}) {
  const [parts, setParts] = useState(initialNameParts(source, language));
  const [confirmed, setConfirmed] = useState(false);
  return (
    <NameSplitEditor
      source={source}
      language={language}
      familyName={parts.familyName}
      givenName={parts.givenName}
      confirmed={confirmed}
      onChange={(familyName, givenName) => {
        setParts({ familyName, givenName });
        setConfirmed(false);
      }}
      onConfirm={() => setConfirmed(true)}
    />
  );
}

describe("name split suggestions", () => {
  it("preserves Unicode characters and suggests only the first Korean character as family", () => {
    expect(initialNameParts("홍길동", "korean")).toEqual({
      familyName: "홍",
      givenName: "길동",
    });
    expect(initialNameParts("김민수", "korean")).toEqual({
      familyName: "김",
      givenName: "민수",
    });
  });
  it("splits English whitespace without changing case or inventing a single-token split", () => {
    expect(initialNameParts("  Van   der Meer  ", "english")).toEqual({
      familyName: "Van",
      givenName: "der Meer",
    });
    expect(initialNameParts("Madonna", "english")).toEqual({
      familyName: "",
      givenName: "Madonna",
    });
  });
  it("updates compound surname fields when the divider moves and requires renewed confirmation", () => {
    render(<Editor />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
    expect(screen.getByLabelText("국문 성")).toHaveValue("남궁");
    expect(screen.getByLabelText("국문 이름")).toHaveValue("민수");
    fireEvent.click(screen.getByRole("button", { name: "이름 확인 완료" }));
    expect(screen.getByRole("status")).toHaveTextContent("확인 완료");
    fireEvent.change(screen.getByLabelText("국문 이름"), {
      target: { value: "지수" },
    });
    expect(screen.getByRole("status")).toHaveTextContent("확인 필요");
    expect(screen.getByRole("slider")).toHaveAttribute(
      "aria-valuetext",
      "성 남궁, 이름 지수",
    );
  });
  it("swaps English names and allows compound family names at word boundaries", () => {
    render(<Editor source="Van der Meer" language="english" />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
    expect(screen.getByLabelText("영문 성")).toHaveValue("Van der");
    fireEvent.click(screen.getByRole("button", { name: "성·이름 바꾸기" }));
    expect(screen.getByLabelText("영문 성")).toHaveValue("Meer");
    expect(screen.getByLabelText("영문 이름")).toHaveValue("Van der");
  });
  it("does not confirm missing name parts", () => {
    render(<Editor source="Madonna" language="english" />);
    expect(
      screen.getByRole("button", { name: "이름 확인 완료" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("영문 성"), {
      target: { value: "Test" },
    });
    expect(
      screen.getByRole("button", { name: "이름 확인 완료" }),
    ).toBeEnabled();
  });
});
