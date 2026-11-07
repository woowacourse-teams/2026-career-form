import { useEffect, useRef, useState } from "react";
import type { TrackEvent } from "../src/analytics/events";
import logo from "../public/side-panel-launcher-logo.png";
import { steps, STORE_URL } from "./content";
import { Trial } from "./try/Trial";
import { Icon } from "./Icons";
import { ChromeGuide, OpeningGuide, ServiceGuide } from "./Guide";
import styles from "./Site.module.css";
import { SiteLink } from "./site-navigation";
import { Landing } from "./landing/Landing";
import brand from "./landing/brand.module.css";
import { PolicyPage } from "./pages/PolicyPage";
import { TechPage } from "./pages/TechPage";

const noopTrack: TrackEvent = () => {};

function InstallLink({
  onInstall,
  className,
  describedBy,
}: {
  onInstall: () => void;
  className?: string;
  describedBy?: string;
}) {
  return (
    <SiteLink
      className={className ? `${styles.primary} ${className}` : styles.primary}
      href={STORE_URL}
      aria-describedby={describedBy}
      onClick={onInstall}
      target="_blank"
      rel="noopener noreferrer"
    >
      Chrome에 추가 <Icon name="arrow" />
    </SiteLink>
  );
}
function Header({ extension }: { extension: boolean }) {
  return (
    <header className={styles.header}>
      <SiteLink
        className={styles.brand}
        href="/"
        aria-label={extension ? "Career Form" : undefined}
      >
        <img src={logo} alt="" />
        {extension ? (
          <span>Career Form</span>
        ) : (
          <>
            career<span>form</span>
            <b>.</b>
          </>
        )}
      </SiteLink>
      <SiteLink
        className={styles.introductionLink}
        href="/"
        aria-label={extension ? "소개 페이지로 ↗" : undefined}
      >
        {extension ? "소개 페이지 ↗" : "소개 페이지로 ↗"}
      </SiteLink>
    </header>
  );
}
function Footer() {
  return (
    <footer className={styles.footer}>
      <span>careerform. · 공고 저장부터 지원서 자동 입력까지</span>
      <nav aria-label="안내 페이지">
        <SiteLink href="/onboarding/">사용 방법</SiteLink>
        <SiteLink href="/try/">체험</SiteLink>
        <SiteLink href="/tech/">기술 소개</SiteLink>
      </nav>
      <nav aria-label="정책 안내">
        <SiteLink href="/privacy/">개인정보처리방침</SiteLink>
        <SiteLink href="/terms/">이용약관</SiteLink>
      </nav>
      <small>© 2026 Career Form</small>
    </footer>
  );
}
function Onboarding({ onInstall }: { onInstall: () => void }) {
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const current = steps[step];
  useEffect(() => {
    if (moved.current) heading.current?.focus({ preventScroll: true });
  }, [step]);
  function go(next: number) {
    moved.current = true;
    setStep(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  return (
    <main id="main" className={styles.onboarding}>
      <aside>
        <p className={styles.eyebrow}>시작 안내</p>
        <h2>
          커리어폼과 함께,
          <br />첫 지원을 준비하세요.
        </h2>
        <ol>
          {steps.map((item, i) => (
            <li key={item.label} aria-current={step === i ? "step" : undefined}>
              <span>0{i + 1}</span>
              {item.label}
            </li>
          ))}
        </ol>
        <img src={logo} alt="" />
      </aside>
      <section className={styles.guideContent}>
        <div className={styles.stepCount}>
          시작 안내{" "}
          <span>
            0{step + 1} / 0{steps.length}
          </span>
        </div>
        <h1 ref={heading} tabIndex={-1}>
          {current.title}
        </h1>
        <p className={styles.description}>{current.description}</p>
        {step === 0 && (
          <div className={styles.notice}>
            <strong>Chrome 웹 스토어에서 설치</strong>
            <p>
              스토어에서 <strong>‘Chrome에 추가’를 누르세요.</strong> 설치가
              끝나면 시작 안내가 열려요. 프로필 등록부터 이어서 진행하세요.
            </p>
            <InstallLink onInstall={onInstall} />
          </div>
        )}
        {step === 2 && <OpeningGuide />}
        <div className={styles.guideLayout}>
          <div className={styles.guideVisual}>
            {step === 0 && <ChromeGuide />}
            {step === 1 && <ServiceGuide kind="profile" />}
            {step === 3 && <ServiceGuide kind="results" />}
            {step === 2 && <ServiceGuide kind="autofill" />}
          </div>
          <ol className={styles.instructions}>
            {current.instructions.map(([title, body], i) => (
              <li key={title}>
                <span>{i + 1}</span>
                <div>
                  <h2>{title}</h2>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className={styles.stepActions}>
          {step > 0 && (
            <button onClick={() => go(step - 1)}>← 이전 안내</button>
          )}
          {step < steps.length - 1 ? (
            <button className={styles.primary} onClick={() => go(step + 1)}>
              {step === 0
                ? "프로필 등록 알아보기"
                : step === 1
                  ? "지원서에서 사용하기"
                  : "결과 확인 알아보기"}{" "}
              <Icon name="arrow" />
            </button>
          ) : (
            <div className={styles.ready}>
              <strong>이제 지원서에서 시작해 보세요.</strong>
              <p>작성 중인 지원서 탭에서 커리어폼을 열면 돼요.</p>
              <InstallLink onInstall={onInstall} />
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
function TryPage({
  track,
  surface,
  onInstall,
}: {
  track: TrackEvent;
  surface: "site" | "extension_onboarding";
  onInstall: () => void;
}) {
  const [narrow, setNarrow] = useState(
    () => window.matchMedia?.("(max-width: 700px)").matches ?? false,
  );
  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 700px)");
    if (!media) return;
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return (
    <div id="main" className={styles.tryPage}>
      <div className={styles.tryHead}>
        <div>
          <p className={styles.eyebrow}>설치 없이 체험하기</p>
          <h1>가상 지원서에서 자동 기입을 눌러보세요.</h1>
          <p>
            예시 프로필과 가상 지원서로 체험해요. 실제 지원서나 제출은 없어요.
          </p>
        </div>
        <InstallLink onInstall={onInstall} />
      </div>
      {narrow ? (
        <div className={styles.tryFallback}>
          <strong>체험은 데스크톱 Chrome에서 할 수 있어요.</strong>
          <p>
            지원서와 패널을 나란히 놓고 눌러보는 화면이라 넓은 화면이 필요해요.
            소개 페이지의 시뮬레이션으로 흐름을 먼저 볼 수 있어요.
          </p>
          <SiteLink href="/">소개 페이지로 ↗</SiteLink>
        </div>
      ) : (
        <>
          <ol className={styles.trySteps} aria-label="체험 순서">
            <li>패널의 ‘자동 기입’ 누르기</li>
            <li>지원서가 채워지는 걸 보기</li>
            <li>마음에 들면 Chrome에 추가</li>
          </ol>
          <Trial
            track={track}
            surface={surface}
            install={<InstallLink onInstall={onInstall} />}
          />
        </>
      )}
    </div>
  );
}
export function SiteApp({
  track = noopTrack,
  surface = "site",
  path = window.location.pathname,
}: {
  track?: TrackEvent;
  surface?: "site" | "extension_onboarding";
  path?: string;
}) {
  const normalized = path.replace(/\/$/, "") || "/";
  const lastRoute = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (lastRoute.current === normalized) return;
    lastRoute.current = normalized;
    if (normalized === "/") track("landing_viewed", { surface });
    else if (normalized === "/onboarding")
      track("onboarding_viewed", { surface });
    else if (normalized === "/try") track("trial_viewed", { surface });
  }, [normalized, surface, track]);
  const onInstall = () => track("install_link_clicked", { surface });
  const skipLink = (
    <SiteLink className={styles.skip} href="#main">
      본문으로 건너뛰기
    </SiteLink>
  );
  // The landing, 기술 소개 and policies use the redesigned frame; the usage
  // guide at /onboarding and /try keep theirs. The extension's first-install
  // flow is its own page and does not render through here.
  const redesigned =
    normalized === "/" ? (
      <Landing onInstall={onInstall} track={track} />
    ) : normalized === "/tech" ? (
      <TechPage onInstall={onInstall} />
    ) : normalized === "/privacy" || normalized === "/terms" ? (
      <PolicyPage
        kind={normalized === "/privacy" ? "privacy" : "terms"}
        onInstall={onInstall}
      />
    ) : null;
  // Rendered outside `.site`: its element rules (button background, svg
  // size, heading colour) belong to the older pages.
  if (redesigned)
    return (
      <>
        <SiteLink className={`${styles.skip} ${brand.skipLink}`} href="#main">
          본문으로 건너뛰기
        </SiteLink>
        {redesigned}
      </>
    );
  return (
    <div className={styles.site}>
      {skipLink}
      <Header extension={surface === "extension_onboarding"} />
      {normalized === "/onboarding" ? (
        <Onboarding onInstall={onInstall} />
      ) : normalized === "/try" ? (
        <TryPage track={track} surface={surface} onInstall={onInstall} />
      ) : (
        <main id="main" className={styles.policy}>
          <h1>페이지를 찾을 수 없어요.</h1>
          <SiteLink href="/">소개 페이지로</SiteLink>
        </main>
      )}
      <Footer />
    </div>
  );
}
