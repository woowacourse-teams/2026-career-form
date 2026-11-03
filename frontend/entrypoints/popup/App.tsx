import { useEffect, useMemo, useState } from "react";

import {
  openInPageProfilePanel,
  openOptionsPage,
} from "../../src/extension/navigation";
import type { ProfileRepository } from "../../src/profile/profile-repository";
import { PROFILE_CATEGORIES } from "../../src/profile/field-definitions";
import { countCompletedCategories } from "../../src/profile/profile-repository";
import { ChromeProfileStorage } from "../../src/storage/chrome-profile-storage";
import styles from "./App.module.css";

interface PopupNavigation {
  openOptions(): Promise<void> | void;
  openInPageProfilePanel(): Promise<void> | void;
}

interface AppProps {
  repository?: ProfileRepository;
  navigation?: PopupNavigation;
  closePopup?(): void;
}

export function App({
  repository: injectedRepository,
  navigation,
  closePopup,
}: AppProps) {
  const repository = useMemo(
    () => injectedRepository ?? new ChromeProfileStorage(),
    [injectedRepository],
  );
  const actions = navigation ?? {
    openOptions: openOptionsPage,
    openInPageProfilePanel,
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
      (closePopup ?? window.close)();
    } catch {
      setActionError(true);
    }
  };

  return (
    <div className={styles.popup}>
      <header className={styles.header}>
        <img
          className={styles.logo}
          src="/side-panel-launcher-logo.png"
          alt=""
          width={32}
          height={32}
        />
        <h1>커리어폼</h1>
      </header>
      <main className={styles.main}>
        <section className={styles.readiness} aria-label="프로필 준비 상태">
          <div className={styles.readinessRow}>
            <span>프로필 준비</span>
            <strong>
              {completedCategories === undefined && "확인 중"}
              {completedCategories === null && "준비 상태 확인 실패"}
              {typeof completedCategories === "number" && (
                <>
                  <span aria-hidden="true">
                    {`${completedCategories} / ${PROFILE_CATEGORIES.length}`}
                  </span>
                  <span className={styles.visuallyHidden}>
                    {`${PROFILE_CATEGORIES.length}개 범주 중 ${completedCategories}개 준비됨`}
                  </span>
                </>
              )}
            </strong>
          </div>
          <div className={styles.progress} aria-hidden="true">
            <span
              style={{
                width: `${typeof completedCategories === "number" ? Math.min(100, (completedCategories / PROFILE_CATEGORIES.length) * 100) : 0}%`,
              }}
            />
          </div>
        </section>
        <div className={styles.actions}>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => void runAction(actions.openInPageProfilePanel)}
          >
            지원서 패널 열기
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
        </div>
      </main>
    </div>
  );
}
