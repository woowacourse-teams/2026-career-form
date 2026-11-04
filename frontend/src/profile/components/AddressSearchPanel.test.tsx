import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AddressSearchResult, StructuredAddress } from "../address-search";
import { AddressSearchPanel } from "./AddressSearchPanel";

const first: StructuredAddress = {
  postalCode: "63309",
  roadAddress: "제주특별자치도 제주시 첨단로 242",
  jibunAddress: "제주특별자치도 제주시 영평동 2181",
  buildingManagementNumber: "5011010400121810000000001",
};

function page(
  addresses: StructuredAddress[],
  pageNumber = 1,
  totalCount = addresses.length,
): AddressSearchResult {
  return {
    ok: true,
    addresses,
    page: pageNumber,
    pageSize: 10,
    totalCount,
  };
}

function setup(
  search: (query: string, page: number) => Promise<AddressSearchResult>,
  contact: Record<string, string> = {},
) {
  const onSelect = vi.fn();
  render(
    <AddressSearchPanel
      contact={contact}
      onSelect={onSelect}
      search={search}
    />,
  );
  return { onSelect };
}

function open() {
  fireEvent.click(screen.getByRole("button", { name: "주소 검색" }));
  return screen.getByRole("textbox", { name: "주소 검색어" });
}

function submit(query = "첨단로 242") {
  const input = open();
  fireEvent.change(input, { target: { value: query } });
  fireEvent.keyDown(input, { key: "Enter" });
  return input;
}

describe("AddressSearchPanel", () => {
  it("shows road address, postal code and jibun and selects with the keyboard-reachable row", async () => {
    const search = vi.fn(async () => page([first]));
    const { onSelect } = setup(search);

    submit();

    const row = await screen.findByRole("button", {
      name: /제주특별자치도 제주시 첨단로 242/,
    });
    expect(row.tagName).toBe("BUTTON");
    expect(row).toHaveTextContent("63309");
    expect(row).toHaveTextContent("제주특별자치도 제주시 영평동 2181");
    expect(search).toHaveBeenCalledWith("첨단로 242", 1);

    fireEvent.click(row);

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(first);
    expect(screen.queryByRole("textbox", { name: "주소 검색어" })).toBeNull();
    expect(screen.getByRole("button", { name: "주소 검색" })).toHaveFocus();
  });

  it("shows a loading label until the result arrives", async () => {
    let resolve!: (value: AddressSearchResult) => void;
    setup(() => new Promise((done) => (resolve = done)));

    submit();

    expect(screen.getByRole("status")).toHaveTextContent("검색 중");
    resolve(page([]));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("결과 없음"),
    );
  });

  it.each([
    ["INVALID_INPUT", "검색어 확인"],
    ["RATE_LIMITED", "잠시 후 다시"],
    ["UNAVAILABLE", "검색 실패"],
    ["NOT_CONFIGURED", "검색 미설정"],
    ["NETWORK", "연결 실패"],
  ] as const)("labels %s briefly", async (code, label) => {
    setup(async () => ({ ok: false, code }));

    submit();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(label),
    );
  });

  it("does not search a blank query", () => {
    const search = vi.fn(async () => page([]));
    setup(search);

    submit("   ");

    expect(search).not.toHaveBeenCalled();
  });

  it("limits the query to the server's maximum length", () => {
    setup(async () => page([]));
    expect(open()).toHaveAttribute("maxlength", "80");
  });

  it("ignores a stale response after a newer search", async () => {
    const resolvers: ((value: AddressSearchResult) => void)[] = [];
    setup(() => new Promise((done) => resolvers.push(done)));

    const input = submit("첫 검색어");
    fireEvent.change(input, { target: { value: "둘째 검색어" } });
    fireEvent.keyDown(input, { key: "Enter" });

    resolvers[1]!(page([{ ...first, postalCode: "22222" }]));
    await screen.findByText("22222");
    resolvers[0]!(page([{ ...first, postalCode: "11111" }]));
    await Promise.resolve();

    expect(screen.queryByText("11111")).toBeNull();
    expect(screen.getByText("22222")).toBeInTheDocument();
  });

  it("pages with the searched query even after the input changes", async () => {
    const search = vi.fn(async (_query: string, pageNumber: number) =>
      page([{ ...first, postalCode: `0000${pageNumber}` }], pageNumber, 11),
    );
    setup(search);

    const input = submit("첫 검색어");
    await screen.findByText("00001");
    expect(screen.getByRole("button", { name: "이전" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "바뀐 입력" } });

    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    await screen.findByText("00002");
    expect(search).toHaveBeenLastCalledWith("첫 검색어", 2);
    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
  });

  it("hides paging for a single page", async () => {
    setup(async () => page([first]));

    submit();

    await screen.findByText("63309");
    expect(screen.queryByRole("button", { name: "다음" })).toBeNull();
  });

  it("closes with Escape, forgets the query and returns focus", async () => {
    setup(async () => page([first]));

    const input = submit();
    await screen.findByText("63309");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("textbox", { name: "주소 검색어" })).toBeNull();
    expect(screen.getByRole("button", { name: "주소 검색" })).toHaveFocus();
    expect(open()).toHaveValue("");
    expect(screen.queryByText("63309")).toBeNull();
  });

  it("labels an address that was not selected from the search", () => {
    setup(async () => page([]), { addressLine1: "직접 입력한 주소" });
    expect(screen.getByText("검증 안 된 주소")).toBeInTheDocument();
  });

  it("shows no label without an address", () => {
    setup(async () => page([]), { email: "a@example.test" });
    expect(screen.queryByText("검증 안 된 주소")).toBeNull();
  });

  it("shows the stored jibun address for a verified selection", () => {
    setup(async () => page([]), {
      postalCode: first.postalCode,
      addressLine1: first.roadAddress,
      jibunAddress: first.jibunAddress,
      buildingManagementNumber: first.buildingManagementNumber,
      addressVerified: "true",
    });
    expect(screen.queryByText("검증 안 된 주소")).toBeNull();
    expect(screen.getByText("검증된 주소")).toBeInTheDocument();
    expect(screen.getByText(first.jibunAddress)).toBeInTheDocument();
  });

  it("writes neither the query nor results to the console", async () => {
    const spies = (["log", "debug", "info", "warn", "error"] as const).map(
      (method) => vi.spyOn(console, method),
    );
    const { onSelect } = setup(async () => page([first]));

    submit();
    fireEvent.click(await screen.findByText(first.roadAddress));

    expect(onSelect).toHaveBeenCalledOnce();
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});
