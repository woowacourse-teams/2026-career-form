import { useCallback, useEffect, useState } from "react";
import { App } from "./App";
import { JobPostings } from "../../src/job-postings/JobPostings";
import { browserStepStore, type StepStore } from "../onboarding/flow/steps";
import styles from "./ManagementApp.module.css";
export function ManagementApp({
  stepStore = browserStepStore,
}: { stepStore?: StepStore } = {}) {
  const [hash, setHash] = useState(() => window.location.hash);
  // The first-install onboarding was left before its last step.
  const [unfinished, setUnfinished] = useState(false);
  useEffect(() => {
    let active = true;
    void stepStore.read().then((step) => {
      if (active) setUnfinished(step !== undefined && step !== "usage");
    });
    return () => {
      active = false;
    };
  }, [stepStore]);
  useEffect(() => {
    const changed = () => setHash(window.location.hash);
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  const postings = hash.startsWith("#postings");
  // The side panel deep-links to the 알림 설정 dialog with this hash.
  const settings = hash === "#postings/settings";
  const navigate = useCallback((value: string) => {
    window.location.hash = value;
    setHash(value);
  }, []);
  const settingsOpened = useCallback(() => navigate("#postings"), [navigate]);
  useEffect(() => {
    document.title = `${postings ? "지원 공고" : "프로필 관리"} | Career Form`;
  }, [postings]);
  return (
    <>
      <header className={styles.masthead}>
        <div className={styles.shell}>
          <div className={styles.brand}>
            <img
              className={styles.brandMark}
              src="/side-panel-launcher-logo.png"
              alt=""
            />{" "}
            Career Form
          </div>
          <nav className={styles.navigation} aria-label="관리 메뉴">
            <button
              aria-current={!postings ? "page" : undefined}
              onClick={() => navigate("#profile")}
            >
              프로필 관리
            </button>
            <button
              aria-current={postings ? "page" : undefined}
              onClick={() => navigate("#postings")}
            >
              지원 공고
            </button>
            {unfinished && <a href="/onboarding.html">시작 안내 이어하기</a>}
          </nav>
        </div>
      </header>
      {postings ? (
        <JobPostings
          openSettings={settings}
          onSettingsOpened={settingsOpened}
        />
      ) : (
        <App />
      )}
    </>
  );
}
