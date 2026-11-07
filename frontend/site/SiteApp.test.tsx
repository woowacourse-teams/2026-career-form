import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteApp } from "./SiteApp";

beforeEach(() => vi.spyOn(window, "scrollTo").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());
describe("website navigation", () => {
  it("offers the published extension from every install button on the landing", () => {
    const { container } = render(<SiteApp path="/" />);
    const install = screen.getAllByRole("link", { name: /Chrome에 추가/ });
    expect(install.length).toBeGreaterThan(0);
    for (const link of install) {
      expect(new URL(link.getAttribute("href")!).pathname).toBe(
        "/detail/career-form/lneeceajpkjfffibjoajdkfelhoojbam",
      );
      expect(link).toHaveAttribute("target", "_blank");
    }
    expect(container.querySelectorAll("iframe")).toHaveLength(0);
    expect(
      screen.getByRole("link", { name: "개인정보처리방침" }),
    ).toHaveAttribute("href", "/privacy/");
  });
  it("moves through installation guidance without collecting profile data or replaying a demo", () => {
    const { container } = render(<SiteApp path="/onboarding/" />);
    expect(screen.getByRole("link", { name: /Chrome에 추가/ })).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: /프로필 등록 알아보기/ }),
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "프로필",
    );
    fireEvent.click(
      screen.getByRole("button", { name: /지원서에서 사용하기/ }),
    );
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
    "identifies %s as a draft without a contact address that does not exist yet",
    (path) => {
      render(<SiteApp path={path} />);
      expect(screen.getByText("검토용 초안 · 시행일 미정")).toBeVisible();
      expect(screen.getByText("개설 후 기재")).toBeInTheDocument();
      expect(screen.queryByText(/careerform@gmail\.com/)).toBeNull();
      expect(
        screen.getByRole("navigation", { name: "문서 목차" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Chrome에 추가/ }),
      ).toHaveAttribute("target", "_blank");
    },
  );
  it("links the landing to the tech page from the footer", () => {
    render(<SiteApp path="/" />);
    expect(
      within(screen.getByRole("navigation", { name: "안내 페이지" })).getByRole(
        "link",
        { name: "기술 소개" },
      ),
    ).toHaveAttribute("href", "/tech/");
  });
  it("explains the field matching change with its measurement conditions", () => {
    render(<SiteApp path="/tech/" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "커리어폼은 이렇게 동작해요",
    );
    expect(screen.getByText("4.2초")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).getByText("aes128gcm"),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("figure")).toHaveLength(2);
    expect(screen.getByRole("img", { name: /신뢰도 0.5 미만/ })).toBeVisible();
    expect(screen.getByText(/측정 조건: 칸 67개/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /마감 알림이 브라우저에/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "기술 소개" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
  it("offers the hands-on trial right below the AI scene", () => {
    render(<SiteApp path="/" />);
    expect(screen.getByRole("link", { name: "직접 해보기" })).toHaveAttribute(
      "href",
      "#try",
    );
    expect(
      screen.getByRole("heading", { name: "이번엔 직접 눌러보세요." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /자동 기입/ })).toBeEnabled();
  });
  it("runs the trial on a virtual application without storing anything", () => {
    const track = vi.fn();
    render(<SiteApp path="/try/" track={track} />);
    expect(track).toHaveBeenCalledWith("trial_viewed", { surface: "site" });
    expect(
      screen.getByRole("heading", { level: 1, name: /자동 기입을 눌러보세요/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "지원서 작성" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: /자동 기입/ }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /Chrome에 추가/ }),
    ).not.toHaveLength(0);
  });
  it("explains the two management buttons inside the trial panel instead of opening extension pages", () => {
    render(<SiteApp path="/try/" />);
    fireEvent.click(screen.getByRole("button", { name: "설정" }));
    fireEvent.click(screen.getByRole("button", { name: /프로필 관리/ }));
    const profile = screen.getByRole("dialog", {
      name: /프로필 관리는 설치 후에 열려요/,
    });
    expect(within(profile).getByText(/내 브라우저에만 저장/)).toBeVisible();
    expect(
      within(profile).getByRole("link", { name: /Chrome에 추가/ }),
    ).toHaveAttribute("target", "_blank");
    fireEvent.click(
      within(profile).getByRole("button", { name: "체험으로 돌아가기" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /마감 공고/ }));
    fireEvent.click(screen.getByRole("button", { name: /공고 관리/ }));
    expect(
      screen.getByRole("dialog", { name: /지원 공고 관리는 설치 후에 열려요/ }),
    ).toBeVisible();
    expect(screen.queryByText(/열지 못했습니다/)).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("does not present an unknown route as a valid policy", () => {
    render(<SiteApp path="/missing/" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "찾을 수",
    );
  });
});

it("explains grouped results and copy after the application step", () => {
  const { container } = render(<SiteApp path="/onboarding/" />);
  fireEvent.click(screen.getByRole("button", { name: /프로필 등록 알아보기/ }));
  fireEvent.click(screen.getByRole("button", { name: /지원서에서 사용하기/ }));
  fireEvent.click(screen.getByRole("button", { name: /결과 확인 알아보기/ }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "입력한 내용",
  );
  expect(
    screen.getByTitle("값을 복사해 지원서에 붙여넣는 시연"),
  ).toHaveAttribute("src", "/demo/?view=guide-results");
  expect(screen.getByText(/값을 복사해 지원서에 붙여넣으세요/)).toBeVisible();
  expect(container.querySelector("input")).toBeNull();
});

it("leads with 의사결정 AI(JEV) reading and filling the application", () => {
  const { container } = render(<SiteApp path="/" />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "지원서 칸,AI가 읽고 채워요.",
  );
  for (const step of [
    "자동 기입을 누르면",
    "지원서를 묶음으로 나눠요",
    "묶음의 종류를 판단해요",
    "후보를 좁혀요",
    "하나 고르고 확신을 재요",
    "몇 초 만에 채워요",
    "애매한 칸은 물어봐요",
  ])
    expect(screen.getByRole("heading", { name: step })).toBeInTheDocument();
  expect(container.querySelector("details[open]")).toBeNull();
  expect(screen.getAllByRole("link", { name: /Chrome에 추가/ })).toHaveLength(
    3,
  );
});

it("랜딩에서 마감 알림과 지원 완료 시 남은 알림 취소를 소개한다", () => {
  render(<SiteApp path="/" />);
  expect(
    screen.getByRole("heading", { name: /마감 전에 다시 알려드려요/ }),
  ).toBeInTheDocument();
  expect(screen.getByText("2시간 전 알림 취소")).toBeInTheDocument();
  expect(
    screen.getByText(/지원 완료라서 더 알리지 않아요/),
  ).toBeInTheDocument();
});

it("shows the four-step usage guide at /onboarding, starting from installation", () => {
  render(<SiteApp path="/onboarding/" />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Chrome에 커리어폼을 추가하세요.",
  );
  expect(screen.queryByText("무엇부터 시작할까요?")).toBeNull();
  expect(screen.queryByRole("button", { name: "알림 테스트" })).toBeNull();
});
