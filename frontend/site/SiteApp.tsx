import { useEffect, useRef, useState } from "react";
import logo from "../public/side-panel-launcher-logo.png";
import { benefits, faqs, steps, STORE_URL } from "./content";
import { policies } from "./policies";
import { Icon } from "./Icons";
import { ChromeGuide, OpeningGuide, ServiceGuide } from "./Guide";
import styles from "./Site.module.css";
import { SiteLink, useSiteUrl } from "./site-navigation";

function InstallLink() {
  return (
    <SiteLink
      className={styles.primary}
      href={STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      Chrome에 추가 <Icon name="arrow" />
    </SiteLink>
  );
}
function Header({ landing }: { landing: boolean }) {
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
          <InstallLink />
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
      <span>careerform. · 채용 지원서 자동 입력</span>
      <nav aria-label="정책 안내">
        <SiteLink href="/privacy/">개인정보처리방침</SiteLink>
        <SiteLink href="/terms/">이용약관</SiteLink>
      </nav>
      <small>© 2026 Career Form</small>
    </footer>
  );
}
function Landing() {
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
              <InstallLink />
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
      <section className={styles.conversion} aria-labelledby="start-title">
        <p className={styles.eyebrow}>다음 지원부터, 커리어폼</p>
        <h2 id="start-title">
          반복 입력은 줄이고,
          <br />
          다음 기회에 집중하세요.
        </h2>
        <InstallLink />
        <p>Chrome에 추가하고, 내 정보부터 등록해 보세요.</p>
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
  installed,
  profileHref,
}: {
  installed: boolean;
  profileHref?: string;
}) {
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const visibleSteps = installed ? steps.slice(1) : steps;
  const current = visibleSteps[step];
  const contentStep = step + (installed ? 1 : 0);
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
          {installed ? "설치 완료!" : "커리어폼과 함께,"}
          <br />첫 지원을 준비하세요.
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
        {step === 0 && !installed && (
          <div className={styles.notice}>
            <strong>Chrome 웹 스토어에서 설치</strong>
            <p>
              스토어에서 <strong>‘Chrome에 추가’를 누르세요.</strong> 설치가
              끝나면 시작 안내가 열려요. 프로필 등록부터 이어서 진행하세요.
            </p>
            <InstallLink />
          </div>
        )}
        {contentStep === 2 && <OpeningGuide />}
        <div className={styles.guideLayout}>
          <div className={styles.guideVisual}>
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
        <div className={styles.stepActions}>
          {step > 0 && (
            <button onClick={() => go(step - 1)}>← 이전 안내</button>
          )}
          {step < visibleSteps.length - 1 ? (
            <button className={styles.primary} onClick={() => go(step + 1)}>
              {contentStep === 0
                ? "프로필 등록 알아보기"
                : contentStep === 1
                  ? "지원서에서 사용하기"
                  : "결과 확인 알아보기"}{" "}
              <Icon name="arrow" />
            </button>
          ) : (
            <div className={styles.ready}>
              <strong>이제 지원서에서 시작해 보세요.</strong>
              <p>작성 중인 지원서 탭에서 커리어폼을 열면 돼요.</p>
              {profileHref ? (
                <a href={profileHref} target="_blank" rel="noreferrer">
                  내 프로필 확인하기 ↗
                </a>
              ) : (
                <InstallLink />
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
  path = window.location.pathname,
  installed = false,
  profileHref,
}: {
  path?: string;
  installed?: boolean;
  profileHref?: string;
}) {
  const normalized = path.replace(/\/$/, "") || "/";
  const landing = normalized === "/";
  return (
    <div className={styles.site}>
      <SiteLink className={styles.skip} href="#main">
        본문으로 건너뛰기
      </SiteLink>
      <Header landing={landing} />
      {landing ? (
        <Landing />
      ) : normalized === "/onboarding" ? (
        <Onboarding installed={installed} profileHref={profileHref} />
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
