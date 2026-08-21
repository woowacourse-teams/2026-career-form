import { useEffect, useMemo, useState } from "react";

import { openOptionsPage, openSidePanel } from "../../src/extension/navigation";
import type { ProfileRepository } from "../../src/profile/profile-repository";
import { countCompletedCategories } from "../../src/profile/profile-repository";
import { ChromeProfileStorage } from "../../src/storage/chrome-profile-storage";
import styles from "./App.module.css";

interface PopupNavigation {
  openOptions(): Promise<void> | void;
  openSidePanel(): Promise<void> | void;
}

interface AppProps {
  repository?: ProfileRepository;
  navigation?: PopupNavigation;
}

export function App({ repository: injectedRepository, navigation }: AppProps) {
  const repository = useMemo(
    () => injectedRepository ?? new ChromeProfileStorage(),
    [injectedRepository],
  );
  const actions = navigation ?? {
    openOptions: openOptionsPage,
    openSidePanel,
  };
  const [completedCategories, setCompletedCategories] = useState<
    number | null
  >();
  const [actionError, setActionError] = useState(false);

  useEffect(() => {
    repository
      .load()
      .then((profile) =>
        setCompletedCategories(countCompletedCategories(profile)),
      )
      .catch(() => setCompletedCategories(null));
  }, [repository]);

  const runAction = async (action: () => Promise<void> | void) => {
    try {
      setActionError(false);
      await action();
    } catch {
      setActionError(true);
    }
  };

  return (
    <div className={styles.popup}>
      <header className={styles.header}>
        <div className={styles.logo} aria-hidden="true">
          CF
        </div>
        <div>
          <p>CAREER FORM</p>
          <h1>지원서 입력을 더 가볍게</h1>
        </div>
      </header>
      <main className={styles.main}>
        <section className={styles.readiness} aria-label="프로필 준비 상태">
          <div>
            <span>프로필 준비 상태</span>
            <strong>
              {completedCategories === undefined && "확인 중"}
              {completedCategories === null && "준비 상태 확인 실패"}
              {typeof completedCategories === "number" &&
                `10개 범주 중 ${completedCategories}개 준비됨`}
            </strong>
          </div>
          <div className={styles.progress} aria-hidden="true">
            <span
              style={{
                width: `${typeof completedCategories === "number" ? completedCategories * 10 : 0}%`,
              }}
            />
          </div>
        </section>
        <p className={styles.guide}>
          저장된 실제 값은 팝업에 표시하지 않습니다. 지원서 옆 사이드 패널에서
          필요한 값만 확인하세요.
        </p>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={() => void runAction(actions.openSidePanel)}
        >
          사이드 패널 열기
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => void runAction(actions.openOptions)}
        >
          프로필 관리
        </button>
        {actionError && (
          <p role="alert">화면을 열지 못했습니다. 다시 시도해 주세요.</p>
        )}
      </main>
      <footer className={styles.footer}>
        선택한 항목만 기입하며 저장, 이동, 제출은 실행하지 않습니다.
      </footer>
    </div>
  );
}
