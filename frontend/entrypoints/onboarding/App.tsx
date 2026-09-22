import { useState } from "react";
import { ChromeGuide, OpeningGuide } from "../../site/Guide";
import styles from "./App.module.css";

export function App({
  openOptions,
  close = () => window.close(),
}: {
  openOptions(): Promise<void> | void;
  close?(): void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <main className={styles.page}>
      <header>
        <span>CAREER FORM</span>
        <button type="button" onClick={close}>
          나중에 할게요
        </button>
      </header>
      <h1>
        반복 입력은 줄이고,
        <br />
        지원에 집중하세요
      </h1>
      <p>내 정보를 한 번 정리하고 지원서에서 꺼내 쓰세요.</p>
      <section>
        <h2>1. 내 지원 정보 준비</h2>
        <p>필요한 항목만 등록하세요. 나중에 추가하거나 수정할 수 있어요.</p>
        <button
          className={styles.primary}
          type="button"
          onClick={async () => {
            try {
              setFailed(false);
              await openOptions();
            } catch {
              setFailed(true);
            }
          }}
        >
          프로필 관리 열기
        </button>
        {failed && (
          <p role="alert">프로필 관리를 열지 못했어요. 다시 시도해 주세요.</p>
        )}
        <p className={styles.privacy}>
          정보는 이 브라우저에 저장돼요. 같은 브라우저를 사용하는 사람에게 보일
          수 있어요.
        </p>
      </section>
      <section>
        <h2>2. 지원서에서 커리어폼 열기</h2>
        <OpeningGuide />
      </section>
      <section>
        <h2>3. 자동입력 후 결과 확인</h2>
        <p>
          패널에서 자동 기입을 시작하세요. 입력 중인 칸을 따라가며 확인하고,
          끝나면 확인 필요 항목을 살펴보세요.
        </p>
        <p>지원서 저장과 제출은 직접 진행해 주세요.</p>
      </section>
      <details>
        <summary>도구 모음에 고정하기</summary>
        <ChromeGuide />
      </details>
    </main>
  );
}
