import { useEffect, useRef, useState } from "react";
import type { TrackEvent } from "../src/analytics/events";
import { OnboardingNotificationCard } from "../src/job-postings/OnboardingNotificationCard";
import type { PushClient } from "../src/job-postings/push-client";
import logo from "../public/side-panel-launcher-logo.png";
import { steps, STORE_URL } from "./content";
import { Trial } from "./try/Trial";
import { Icon } from "./Icons";
import { ChromeGuide, OpeningGuide, ServiceGuide } from "./Guide";
import styles from "./Site.module.css";
import {
  PostingGuide,
  PostingNotificationGuide,
  postingSteps,
} from "./PostingGuide";
import { SiteLink } from "./site-navigation";
import { Landing } from "./landing/Landing";
import brand from "./landing/brand.module.css";
import { PolicyPage } from "./pages/PolicyPage";
import { TechPage } from "./pages/TechPage";

const noopTrack: TrackEvent = () => {};

function InstallLink({
  onInstall,
  className,
}: {
  onInstall: () => void;
  className?: string;
}) {
  return (
    <SiteLink
      className={className ? `${styles.primary} ${className}` : styles.primary}
      href={STORE_URL}
      onClick={onInstall}
      target="_blank"
      rel="noopener noreferrer"
    >
      Chrome에 추가 <Icon name="arrow" />
    </SiteLink>
  );
}
function Header() {
  return (
    <header className={styles.header}>
      <SiteLink className={styles.brand} href="/">
        <img src={logo} alt="" />
        career<span>form</span>
        <b>.</b>
      </SiteLink>
      <SiteLink className={styles.introductionLink} href="/">
        소개 페이지로 ↗
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
function Onboarding({
  onInstall,
  installed: extensionInstalled,
  profileHref: extensionProfileHref,
  postingsHref,
  pushClient,
  onStartAutofill,
  track,
  surface,
}: {
  onInstall: () => void;
  installed: boolean;
  profileHref?: string;
  postingsHref?: string;
  pushClient?: PushClient;
  onStartAutofill?: () => void;
  track: TrackEvent;
  surface: "site" | "extension_onboarding";
}) {
  const [step, setStep] = useState(0);
  const [postingFlow, setPostingFlow] = useState(false);
  const [choosing, setChoosing] = useState(
    Boolean(extensionInstalled && postingsHref),
  );
  const installed = extensionInstalled && !postingsHref;
  const profileHref = postingsHref ? undefined : extensionProfileHref;
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const visibleSteps = postingFlow
    ? postingSteps
    : installed
      ? steps.slice(1)
      : steps;
  const current = visibleSteps[step];
  const contentStep = postingFlow ? -1 : step + (installed ? 1 : 0);
  useEffect(() => {
    if (moved.current) heading.current?.focus({ preventScroll: true });
  }, [step, choosing]);
  function go(next: number) {
    moved.current = true;
    setStep(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  if (choosing)
    return (
      <main id="main" className={styles.startChoice}>
        <p className={styles.eyebrow}>설치 완료 · CAREER FORM</p>
        <h1 ref={heading} tabIndex={-1}>
          무엇부터 시작할까요?
        </h1>
        <p className={styles.choiceDescription}>
          필요한 기능부터 가볍게 시작하세요. 나중에 언제든 함께 사용할 수
          있어요.
        </p>
        <div className={styles.choiceGrid}>
          <section className={styles.choiceCard}>
            <span className={styles.choiceBadge}>반복 입력 줄이기</span>
            <h2>내 정보는 한 번만</h2>
            <p>
              이름과 연락처부터 등록하고 지원서에서 자동 기입을 사용하세요.
              나머지는 필요할 때 추가할 수 있어요.
            </p>
            <button
              className={styles.choiceAction}
              onClick={() => {
                track("onboarding_autofill_selected", { surface });
                if (onStartAutofill) {
                  onStartAutofill();
                  return;
                }
                moved.current = true;
                setChoosing(false);
                setPostingFlow(false);
                go(0);
              }}
            >
              자동 기입 준비하기 <Icon name="arrow" />
            </button>
            <small>프로필 등록 → 자동 기입 → 결과 확인</small>
          </section>
          <section className={styles.choiceCard}>
            <span className={styles.choiceBadge}>프로필 없이 바로 시작</span>
            <h2>관심 공고, 놓치지 않게</h2>
            <p>
              공고 링크와 마감을 저장하고 원하는 시간에 알림을 받으세요. 프로필
              등록 없이 바로 사용할 수 있어요.
            </p>
            <button
              className={styles.choiceAction}
              onClick={() => {
                track("onboarding_postings_selected", { surface });
                setPostingFlow(true);
                setChoosing(false);
                go(0);
              }}
            >
              공고 저장부터 시작하기 <Icon name="arrow" />
            </button>
            <small>패널에서 시작 → 정보 입력 → 지원 완료</small>
          </section>
        </div>
        {pushClient && (
          <OnboardingNotificationCard client={pushClient} track={track} />
        )}
        <p className={styles.choiceNote}>
          Chrome이 완전히 종료된 동안에는 알림이 뜨지 않으며, 절전·방해금지
          설정에 따라 늦거나 차단될 수 있어요. OS 알림이 꺼져 있어도 확장
          아이콘의 숫자와 관리 페이지의 공지함에서 새 공고를 확인할 수 있어요.
          공고와 프로필은 현재 브라우저에 저장됩니다.
        </p>
      </main>
    );
  return (
    <main id="main" className={styles.onboarding}>
      <aside>
        <p className={styles.eyebrow}>시작 안내</p>
        <h2>
          {postingFlow || installed ? "설치 완료!" : "커리어폼과 함께,"}
          <br />
          {postingFlow ? "마감을 놓치지 마세요." : "첫 지원을 준비하세요."}
        </h2>
        <ol>
          {visibleSteps.map((item, i) => (
            <li key={item.label} aria-current={step === i ? "step" : undefined}>
              <span>0{i + 1}</span>
              {item.label}
            </li>
          ))}
        </ol>
        <img src={logo} alt="" />
      </aside>
      <section className={styles.guideContent}>
        {postingFlow && postingsHref && (
          <button
            className={styles.backChoice}
            onClick={() => {
              moved.current = true;
              setChoosing(true);
            }}
          >
            ← 시작 방법 다시 선택
          </button>
        )}
        <div className={styles.stepCount}>
          시작 안내{" "}
          <span>
            0{step + 1} / 0{visibleSteps.length}
          </span>
        </div>
        <h1 ref={heading} tabIndex={-1}>
          {current.title}
        </h1>
        <p className={styles.description}>{current.description}</p>
        {contentStep === 0 && (
          <div className={styles.notice}>
            <strong>Chrome 웹 스토어에서 설치</strong>
            <p>
              스토어에서 <strong>‘Chrome에 추가’를 누르세요.</strong> 설치가
              끝나면 시작 안내가 열려요. 프로필 등록부터 이어서 진행하세요.
            </p>
            <InstallLink onInstall={onInstall} />
          </div>
        )}
        {(contentStep === 2 || (postingFlow && step === 0)) && <OpeningGuide />}
        <div
          className={`${styles.guideLayout} ${postingFlow ? (step === 0 ? styles.postingPanelLayout : styles.postingScreenshotLayout) : ""}`}
        >
          <div className={styles.guideVisual}>
            {postingFlow && <PostingGuide step={step} />}
            {contentStep === 0 && <ChromeGuide />}
            {contentStep === 1 && <ServiceGuide kind="profile" />}
            {contentStep === 3 && <ServiceGuide kind="results" />}
            {contentStep === 2 && <ServiceGuide kind="autofill" />}
          </div>
          <ol className={styles.instructions}>
            {current.instructions.map(([title, body], i) => (
              <li key={title}>
                <span>{i + 1}</span>
                <div>
                  <h2>{title}</h2>
                  <p>
                    {contentStep === 1 && i === 0 && profileHref ? (
                      <>
                        아래{" "}
                        <strong>
                          ‘프로필 등록하기’를 눌러 내 정보를 등록하세요.
                        </strong>{" "}
                        지원서 패널의 ‘프로필 관리’에서도 열 수 있어요.
                      </>
                    ) : (
                      body
                    )}
                  </p>
                  {contentStep === 1 && i === 0 && profileHref && (
                    <a
                      className={`${styles.primary} ${styles.profileAction}`}
                      href={profileHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      프로필 등록하기 <Icon name="arrow" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
        {postingFlow && step === 1 && <PostingNotificationGuide />}
        <div className={styles.stepActions}>
          {step > 0 && (
            <button onClick={() => go(step - 1)}>← 이전 안내</button>
          )}
          {step < visibleSteps.length - 1 ? (
            <button className={styles.primary} onClick={() => go(step + 1)}>
              {postingFlow
                ? step === 0
                  ? "공고 정보 입력하기"
                  : "지원 완료 알아보기"
                : contentStep === 0
                  ? "프로필 등록 알아보기"
                  : contentStep === 1
                    ? "지원서에서 사용하기"
                    : "결과 확인 알아보기"}{" "}
              <Icon name="arrow" />
            </button>
          ) : postingFlow ? (
            <a
              className={`${styles.primary} ${styles.postingFinishAction}`}
              href={postingsHref}
              target="_blank"
              rel="noreferrer"
            >
              공고 추가하기 <Icon name="arrow" />
            </a>
          ) : (
            <div className={styles.ready}>
              <strong>이제 지원서에서 시작해 보세요.</strong>
              <p>작성 중인 지원서 탭에서 커리어폼을 열면 돼요.</p>
              {profileHref ? (
                <a href={profileHref} target="_blank" rel="noreferrer">
                  내 프로필 확인하기 ↗
                </a>
              ) : (
                <InstallLink onInstall={onInstall} />
              )}
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
  installed = false,
  profileHref,
  postingsHref,
  pushClient,
  onStartAutofill,
}: {
  track?: TrackEvent;
  surface?: "site" | "extension_onboarding";
  path?: string;
  installed?: boolean;
  profileHref?: string;
  postingsHref?: string;
  pushClient?: PushClient;
  onStartAutofill?: () => void;
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
  // The landing, 기술 소개 and policies use the redesigned frame; onboarding
  // (also opened by the extension after install) and /try keep theirs.
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
      <Header />
      {normalized === "/onboarding" ? (
        <Onboarding
          installed={installed}
          profileHref={profileHref}
          postingsHref={postingsHref}
          pushClient={pushClient}
          onInstall={onInstall}
          onStartAutofill={onStartAutofill}
          track={track}
          surface={surface}
        />
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
