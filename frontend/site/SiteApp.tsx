import { useEffect, useRef, useState } from "react";
import logo from "../public/side-panel-launcher-logo.png";
import { benefits, faqs, steps, STORE_URL } from "./content";
import { policies } from "./policies";
import { Icon } from "./Icons";
import { ChromeGuide, OpeningGuide, ServiceGuide } from "./Guide";
import styles from "./Site.module.css";

function InstallLink() {
  return (
    <a
      className={styles.primary}
      href={STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      Chrome에 추가 <Icon name="arrow" />
    </a>
  );
}
function Header({ landing }: { landing: boolean }) {
  return (
    <header className={styles.header}>
      <a className={styles.brand} href="/">
        <img src={logo} alt="" />
        career<span>form</span>
        <b>.</b>
      </a>
      {landing ? (
        <>
          <nav aria-label="주 메뉴">
            <a href="#features">주요 기능</a>
            <a href="/onboarding/">사용 방법</a>
            <a href="#faq">궁금한 점</a>
          </nav>
          <InstallLink />
        </>
      ) : (
        <a href="/">소개 페이지로 ↗</a>
      )}
    </header>
  );
}
function Footer() {
  return (
    <footer className={styles.footer}>
      <span>careerform. · 채용 지원서 자동 입력</span>
      <nav aria-label="정책 안내">
        <a href="/privacy/">개인정보처리방침</a>
        <a href="/terms/">이용약관</a>
      </nav>
      <small>© 2026 Career Form</small>
    </footer>
  );
}
function Landing() {
  return (
    <main id="main">
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div>
            <p className={styles.eyebrow}>지원서 자동 입력 · 커리어폼</p>
            <h1>
              내 정보는 한 번만.
              <br />
              <em>지원서는 자동으로.</em>
            </h1>
          </div>
          <div className={styles.heroDetail}>
            <p>
              채용사이트 옆에 커리어폼을 열어보세요.
              <br />
              저장한 정보로 지원서의 입력 가능한 항목을 한 번에 채워요.
            </p>
            <div className={styles.actions}>
              <InstallLink />
              <a href="/onboarding/">설치·사용 안내 ↗</a>
            </div>
            <small>Chrome 확장 프로그램 · 프로필은 내 브라우저에</small>
          </div>
        </div>
        <figure className={styles.simulation}>
          <iframe
            src="/demo/?view=simulation"
            title="커리어폼 자동 입력 시뮬레이션"
            tabIndex={-1}
            inert
          />
          <figcaption>
            자동 입력 시뮬레이션 · 저장된 이름·연락처·학력·자격증 10개 항목을
            입력하고 기입 결과를 확인하는 예시
          </figcaption>
        </figure>
      </section>
      <section className={styles.features} id="features">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>주요 기능</p>
            <h2>
              지원서는 매번 달라도,
              <br />내 정보는 그대로니까.
            </h2>
          </div>
          <p>
            여기저기 흩어진 정보를 찾고, 복사하고, 붙여넣고.
            <br />
            커리어폼이 그 반복을 덜어드릴게요.
          </p>
        </div>
        <div className={styles.benefits}>
          {benefits.map(([title, lead, body], i) => (
            <article key={title}>
              <Icon name={(["document", "panel", "check"] as const)[i]} />
              <h3>{title}</h3>
              <p>
                <strong>{lead}</strong>
                {body}
              </p>
            </article>
          ))}
        </div>
      </section>
      <section className={styles.setupLink}>
        <div>
          <p className={styles.eyebrow}>사용 준비</p>
          <h2>설치부터 첫 입력까지.</h2>
          <p>확장 프로그램 설치와 프로필 등록 방법을 안내해요.</p>
        </div>
        <a className={styles.primary} href="/onboarding/">
          설치·사용 안내 <Icon name="arrow" />
        </a>
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
          {faqs.map(([title, body], i) => (
            <details key={title} open={i === 0}>
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
function Onboarding() {
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
        <p className={styles.eyebrow}>설치·사용 안내</p>
        <h2>
          설치하고,
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
          설치·사용 안내 <span>0{step + 1} / 03</span>
        </div>
        <h1 ref={heading} tabIndex={-1}>
          {current.title}
        </h1>
        <p className={styles.description}>{current.description}</p>
        {step === 0 && (
          <>
            <div className={styles.notice}>
              <strong>Chrome 웹 스토어에서 설치</strong>
              <p>
                스토어에서 ‘Chrome에 추가’를 누르세요. 설치를 마치면 이 페이지로
                돌아와 아래 설정을 진행하세요.
              </p>
              <InstallLink />
            </div>
            <ChromeGuide />
          </>
        )}
        {step === 1 && <ServiceGuide kind="profile" />}
        {step === 2 && (
          <>
            <OpeningGuide />
            <ServiceGuide kind="autofill" />
          </>
        )}
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
        {step === 2 && (
          <div className={styles.notice}>
            <strong>네모 아이콘이 보이지 않나요?</strong>
            <p>
              Chrome 퍼즐 메뉴에서 Career Form을 선택하세요. 자동 기입이 되지
              않는 항목은 프로필에 값이 있는지 확인하고 직접 작성해 주세요.
            </p>
          </div>
        )}
        <div className={styles.stepActions}>
          {step > 0 ? (
            <button onClick={() => go(step - 1)}>← 이전 안내</button>
          ) : (
            <small>이 페이지에서는 설치 여부를 자동 확인하지 않아요.</small>
          )}
          {step < 2 ? (
            <button className={styles.primary} onClick={() => go(step + 1)}>
              {step === 0 ? "프로필 등록 방법" : "첫 실행 방법"}{" "}
              <Icon name="arrow" />
            </button>
          ) : (
            <a className={styles.primary} href="/">
              안내 마치기 <Icon name="arrow" />
            </a>
          )}
        </div>
        <p className={styles.guideNote}>
          실제 설정은 설치한 확장 프로그램에서 진행하세요.
        </p>
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
          <a key={title} href={`#section-${i}`}>
            {title}
          </a>
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
        문의: <a href="mailto:careerform@gmail.com">careerform@gmail.com</a>
      </p>
    </main>
  );
}
export function SiteApp({
  path = window.location.pathname,
}: {
  path?: string;
}) {
  const normalized = path.replace(/\/$/, "") || "/";
  const landing = normalized === "/";
  return (
    <div className={styles.site}>
      <a className={styles.skip} href="#main">
        본문으로 건너뛰기
      </a>
      <Header landing={landing} />
      {landing ? (
        <Landing />
      ) : normalized === "/onboarding" ? (
        <Onboarding />
      ) : normalized === "/privacy" || normalized === "/terms" ? (
        <Policy kind={normalized === "/privacy" ? "privacy" : "terms"} />
      ) : (
        <main id="main" className={styles.policy}>
          <h1>페이지를 찾을 수 없어요.</h1>
          <a href="/">소개 페이지로</a>
        </main>
      )}
      <Footer />
    </div>
  );
}
