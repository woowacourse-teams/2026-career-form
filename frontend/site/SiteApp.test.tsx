import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteApp } from "./SiteApp";

beforeEach(() => vi.spyOn(window, "scrollTo").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());
describe("website navigation", () => {
  it("offers the published extension and a single automatic demonstration", () => {
    const { container } = render(<SiteApp path="/" />);
    const install = screen.getAllByRole("link", { name: /Chrome에 추가/ });
    expect(install.length).toBeGreaterThan(0);
    for (const link of install) {
      expect(new URL(link.getAttribute("href")!).pathname).toBe(
        "/detail/career-form/lneeceajpkjfffibjoajdkfelhoojbam",
      );
      expect(link).toHaveAttribute("target", "_blank");
    }
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "개인정보처리방침" }),
    ).toHaveAttribute("href", "/privacy/");
  });
  it("moves through installation guidance without collecting profile data or replaying a demo", () => {
    const { container } = render(<SiteApp path="/onboarding/" />);
    expect(screen.getByRole("link", { name: /Chrome에 추가/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /다음: 프로필 등록/ }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "프로필",
    );
    fireEvent.click(screen.getByRole("button", { name: /다음: 첫 지원서/ }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "지원서",
    );
    expect(
      screen.getByText(/채용 지원 페이지에 들어가면 작은 네모/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /이전 안내/ }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "프로필",
    );
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector('iframe[src*="simulation"]')).toBeNull();
  });
  it.each(["/privacy/", "/terms/"])(
    "identifies %s as a draft rather than an effective policy",
    (path) => {
      render(<SiteApp path={path} />);
      expect(
        within(screen.getByRole("complementary")).getByText(/검토용 초안/),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "careerform@gmail.com" }),
      ).toHaveAttribute("href", "mailto:careerform@gmail.com");
    },
  );
  it("does not present an unknown route as a valid policy", () => {
    render(<SiteApp path="/missing/" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "찾을 수",
    );
  });
});
