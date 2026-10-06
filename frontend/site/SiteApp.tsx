import { useEffect, useRef, useState } from "react";
import type { TrackEvent } from "../src/analytics/events";
import logo from "../public/side-panel-launcher-logo.png";
import { benefits, faqs, steps, STORE_URL } from "./content";
import { policies } from "./policies";
import { Icon } from "./Icons";
import { ChromeGuide, OpeningGuide, ServiceGuide } from "./Guide";
import styles from "./Site.module.css";
import {
  PostingGuide,
  PostingNotificationGuide,
  postingSteps,
} from "./PostingGuide";
import { SiteLink, useSiteUrl } from "./site-navigation";

const noopTrack: TrackEvent = () => {};

function InstallLink({ onInstall }: { onInstall: () => void }) {
  return (
    <SiteLink
      className={styles.primary}
      href={STORE_URL}
      onClick={onInstall}
      target="_blank"
      rel="noopener noreferrer"
    >
      Chrome에 추가 <Icon name="arrow" />
    </SiteLink>
  );
}
function Header({
  landing,
  onInstall,
}: {
  landing: boolean;
  onInstall: () => void;
}) {
  return (
    <header className={styles.header}>
      <SiteLink className={styles.brand} href="/">
        <img src={logo} alt="" />
        career<span>form</span>
        <b>.</b>
      </SiteLink>
      {landing ? (
        <>
          <nav aria-label="주 메뉴">
            <SiteLink href="#features">주요 기능</SiteLink>
            <SiteLink href="/onboarding/">사용 방법</SiteLink>
            <SiteLink href="#faq">궁금한 점</SiteLink>
          </nav>
          <InstallLink onInstall={onInstall} />
        </>
      ) : (
        <SiteLink className={styles.introductionLink} href="/">
          소개 페이지로 ↗
        </SiteLink>
      )}
    </header>
  );
}
function Footer() {
  return (
    <footer className={styles.footer}>
      <span>careerform. · 공고 저장부터 지원서 자동 입력까지</span>
      <nav aria-label="정책 안내">
        <SiteLink href="/privacy/">개인정보처리방침</SiteLink>
        <SiteLink href="/terms/">이용약관</SiteLink>
      </nav>
      <small>© 2026 Career Form</small>
    </footer>
  );
}
function Landing({ onInstall }: { onInstall: () => void }) {
  const siteUrl = useSiteUrl();
  return (
    <main id="main">
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div>
            <p className={styles.eyebrow}>지원서 자동 입력 · 커리어폼</p>
            <h1>
              지원서는 매번 달라도,
              <br />
              <em>내 정보는 그대로니까.</em>
            </h1>
          </div>
          <div className={styles.heroDetail}>
            <p>
              한 번 등록한 내 정보로,
              <br />
              반복되는 지원서 입력을 줄이세요.
            </p>
            <div className={styles.actions}>
              <InstallLink onInstall={onInstall} />
              <SiteLink href="/onboarding/">사용 방법 보기 ↗</SiteLink>
            </div>
            <small>Chrome 확장 프로그램 · 프로필은 내 브라우저에</small>
          </div>
        </div>
        <figure
          className={styles.simulation}
          tabIndex={0}
          aria-label="자동 입력 시뮬레이션 재생"
        >
          <iframe
            src={siteUrl("/demo/?view=simulation")}
            title="커리어폼 자동 입력 시뮬레이션"
            tabIndex={-1}
            inert
          />
          <figcaption>
            마우스를 올리거나 눌러보세요. · 가상 정보로 만든 예시
          </figcaption>
        </figure>
      </section>
      <section className={styles.features} id="features">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>주요 기능</p>
            <h2>
              같은 정보를 쓰는 일,
              <br />
              이제 조금 덜 하세요.
            </h2>
          </div>
        </div>
        <div className={styles.benefits}>
          {benefits.map(([title, body], i) => (
            <article key={title}>
              <Icon name={(["document", "panel", "check"] as const)[i]} />
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
      <section
        className={styles.postingsFeature}
        id="saved-jobs"
        aria-labelledby="postings-title"
      >
        <div>
          <p className={styles.eyebrow}>공고 저장 · 마감 알림</p>
          <h2 id="postings-title">
            관심 공고는 모아두고,
            <br />
            마감 전에 다시 만나요.
          </h2>
          <p>
            회사명, 직무, 링크와 마감 시각을 저장하세요.
            <br />
            프로필 등록 없이 공고 저장부터 시작할 수 있어요.
          </p>
          <ol className={styles.postingSteps}>
            <li>
              <strong>01 · 공고 저장</strong>
              <span>공고에서 확인한 마감 날짜와 시간을 직접 등록해요.</span>
            </li>
            <li>
              <strong>02 · 마감 알림</strong>
              <span>
                기본 하루 전·2시간 전, 원하는 시간으로 바꿀 수 있어요.
              </span>
            </li>
            <li>
              <strong>03 · 지원 완료</strong>
              <span>지원 완료로 표시하면 남은 알림을 취소해요.</span>
            </li>
          </ol>
          <SiteLink href="/onboarding/">공고 저장부터 시작하는 방법 ↗</SiteLink>
        </div>
        <div
          className={styles.postingsExample}
          aria-label="저장한 공고와 알림 예시"
        >
          <p className={styles.exampleLabel}>
            이렇게 챙겨드려요 · 가상 공고 예시
          </p>
          <div className={styles.exampleJob}>
            <span className={styles.exampleCompany}>가</span>
            <div>
              <strong>가온테크</strong>
              <p>백엔드 개발자</p>
            </div>
            <b>마감 임박</b>
          </div>
          <div className={styles.exampleDeadline}>
            <span>마감</span>
            <strong>10월 15일 · 18:00</strong>
          </div>
          <div className={styles.exampleNotification}>
            <span aria-hidden="true">⏰</span>
            <div>
              <strong>가온테크 (~10/15 18:00)</strong>
              <p>지금 바로 지원하기 →</p>
            </div>
          </div>
          <p className={styles.exampleLabel}>공고는 내 브라우저에 저장돼요.</p>
        </div>
      </section>
      <section className={styles.conversion} aria-labelledby="start-title">
        <p className={styles.eyebrow}>다음 지원부터, 커리어폼</p>
        <h2 id="start-title">
          반복 입력은 줄이고,
          <br />
          다음 기회에 집중하세요.
        </h2>
        <InstallLink onInstall={onInstall} />
        <p>Chrome에 추가하고, 공고 저장 또는 자동 기입부터 시작하세요.</p>
      </section>
      <section className={styles.faq} id="faq">
        <div>
          <p className={styles.eyebrow}>궁금한 점이 있나요?</p>
          <h2>
            시작하기 전에
            <br />
            알아두면 좋아요.
          </h2>
        </div>
        <div>
          {faqs.map(([title, body]) => (
            <details key={title}>
              <summary>
                {title}
                <span>＋</span>
              </summary>
              <p>{body}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
function Onboarding({
  onInstall,
  installed: extensionInstalled,
  profileHref: extensionProfileHref,
  postingsHref,
}: {
  onInstall: () => void;
  installed: boolean;
  profileHref?: string;
  postingsHref?: string;
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
            <span className={styles.choiceBadge}>프로필 없이 바로 시작</span>
            <h2>관심 공고, 놓치지 않게</h2>
            <p>
              공고 링크와 마감을 저장하고 원하는 시간에 알림을 받으세요. 프로필
              등록 없이 바로 사용할 수 있어요.
            </p>
            <button
              className={styles.choiceAction}
              onClick={() => {
                setPostingFlow(true);
                setChoosing(false);
                go(0);
              }}
            >
              공고 저장부터 시작하기 <Icon name="arrow" />
            </button>
            <small>패널에서 시작 → 정보 입력 → 지원 완료</small>
          </section>
          <section className={styles.choiceCard}>
            <span className={styles.choiceBadge}>반복 입력 줄이기</span>
            <h2>내 정보는 한 번만</h2>
            <p>
              프로필을 등록한 뒤 지원서에서 자동 기입을 사용하세요. 입력된
              내용은 직접 확인할 수 있어요.
            </p>
            <button
              className={styles.choiceAction}
              onClick={() => {
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
        </div>
        <p className={styles.choiceNote}>
          Chrome이 완전히 종료된 동안에는 알림이 뜨지 않으며, 절전·방해금지
          설정에 따라 늦거나 차단될 수 있어요. 공고와 프로필은 현재 브라우저에
          저장됩니다.
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
function Policy({ kind }: { kind: "privacy" | "terms" }) {
  const policy = policies[kind];
  return (
    <main id="main" className={styles.policy}>
      <p className={styles.eyebrow}>CAREER FORM / POLICY</p>
      <h1>{policy.title}</h1>
      <aside className={styles.notice}>
        <strong>검토용 초안 · 시행 전</strong>
        <p>정식 서비스의 처리 내역과 시행일은 확정 후 반영합니다.</p>
      </aside>
      <nav aria-label="문서 목차">
        {policy.sections.map(([title], i) => (
          <SiteLink key={title} href={`#section-${i}`}>
            {title}
          </SiteLink>
        ))}
      </nav>
      {policy.sections.map(([title, body], i) => (
        <section key={title} id={`section-${i}`}>
          <h2>{title}</h2>
          <p>{body}</p>
        </section>
      ))}
      <p>
        운영자: 커리어폼
        <br />
        문의:{" "}
        <SiteLink href="mailto:careerform@gmail.com">
          careerform@gmail.com
        </SiteLink>
      </p>
    </main>
  );
}
export function SiteApp({
  track = noopTrack,
  surface = "site",
  path = window.location.pathname,
  installed = false,
  profileHref,
  postingsHref,
}: {
  track?: TrackEvent;
  surface?: "site" | "extension_onboarding";
  path?: string;
  installed?: boolean;
  profileHref?: string;
  postingsHref?: string;
}) {
  const normalized = path.replace(/\/$/, "") || "/";
  const landing = normalized === "/";
  const lastRoute = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (lastRoute.current === normalized) return;
    lastRoute.current = normalized;
    if (normalized === "/") track("landing_viewed", { surface });
    else if (normalized === "/onboarding")
      track("onboarding_viewed", { surface });
  }, [normalized, surface, track]);
  const onInstall = () => track("install_link_clicked", { surface });
  return (
    <div className={styles.site}>
      <SiteLink className={styles.skip} href="#main">
        본문으로 건너뛰기
      </SiteLink>
      <Header landing={landing} onInstall={onInstall} />
      {landing ? (
        <Landing onInstall={onInstall} />
      ) : normalized === "/onboarding" ? (
        <Onboarding
          installed={installed}
          profileHref={profileHref}
          postingsHref={postingsHref}
          onInstall={onInstall}
        />
      ) : normalized === "/privacy" || normalized === "/terms" ? (
        <Policy kind={normalized === "/privacy" ? "privacy" : "terms"} />
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
