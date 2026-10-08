import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../catalog-search";
import type { ProfileIdentity } from "../model";
import { CatalogNameInput } from "./CatalogNameInput";

const entries: readonly CatalogEntry[] = [
  {
    id: "certificate:kdata:sqld",
    kind: "certificate",
    name: "SQL 개발자",
    detail: "한국데이터산업진흥원 · 개발자",
    aliases: ["SQLD"],
  },
  {
    id: "certificate:kdata:sqlp",
    kind: "certificate",
    name: "SQL 전문가",
    detail: "한국데이터산업진흥원 · 전문가",
    aliases: ["SQLP"],
  },
  {
    id: "school:a",
    kind: "university",
    name: "가상대학교",
    detail: "서울 · 본교",
    aliases: [],
  },
  {
    id: "school:b",
    kind: "university",
    name: "가상대학교",
    detail: "부산 · 분교",
    aliases: [],
  },
];

function Harness({
  kind = "certificate",
}: {
  kind?: "certificate" | "university";
}) {
  const [value, setValue] = useState("");
  const [identity, setIdentity] = useState<ProfileIdentity>();
  return (
    <>
      <CatalogNameInput
        id="test-name"
        label="이름"
        kind={kind}
        value={value}
        identity={identity}
        entries={entries}
        onChange={(name, selection) => {
          setValue(name);
          setIdentity(selection ?? { status: "manual", originalText: name });
        }}
      />
      <output data-testid="identity">{JSON.stringify(identity)}</output>
      <button type="button">다음 필드</button>
    </>
  );
}

describe("catalog name selection", () => {
  it("does not infer SQLD from SQL and requires an explicit keyboard choice", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "SQL" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("SQL");
    expect(
      JSON.parse(screen.getByTestId("identity").textContent ?? ""),
    ).toEqual({
      status: "manual",
      originalText: "SQL",
    });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input).toHaveValue("SQL 전문가");
    expect(
      JSON.parse(screen.getByTestId("identity").textContent ?? ""),
    ).toMatchObject({
      status: "selected",
      catalogId: "certificate:kdata:sqlp",
      originalText: "SQL",
    });
  });

  it("keeps same-name campuses as distinct selectable options", () => {
    render(<Harness kind="university" />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "가상대학교" } });

    fireEvent.click(screen.getByRole("option", { name: /부산/ }));

    expect(input).toHaveValue("가상대학교");
    expect(
      JSON.parse(screen.getByTestId("identity").textContent ?? ""),
    ).toMatchObject({
      status: "selected",
      catalogId: "school:b",
    });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByText("부산 · 분교")).toBeInTheDocument();
  });

  it("accepts an unknown name as unverified manual input", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Outside Certificate" } });

    fireEvent.click(screen.getByRole("option", { name: /직접 입력/ }));

    expect(input).toHaveValue("Outside Certificate");
    expect(
      JSON.parse(screen.getByTestId("identity").textContent ?? ""),
    ).toEqual({
      status: "manual",
      originalText: "Outside Certificate",
    });
  });

  it("does not select an active candidate during IME confirmation", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "SQL" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });

    fireEvent.keyDown(input, { key: "Enter", isComposing: true });

    expect(input).toHaveValue("SQL");
  });

  it("closes on Escape without changing text or confirming a candidate", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "SQLD" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });

    fireEvent.keyDown(input, { key: "Escape" });

    expect(input).toHaveValue("SQLD");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("clears the name through its explicit reset action", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "SQLD" } });

    fireEvent.click(screen.getByRole("button", { name: "이름 지우기" }));

    expect(input).toHaveValue("");
    expect(
      JSON.parse(screen.getByTestId("identity").textContent ?? ""),
    ).toEqual({
      status: "manual",
      originalText: "",
    });
  });
});
