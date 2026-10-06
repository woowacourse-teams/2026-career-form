import { useEffect, useState } from "react";
import { App } from "./App";
import { JobPostings } from "../../src/job-postings/JobPostings";
import styles from "./ManagementApp.module.css";
export function ManagementApp() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const changed = () => setHash(window.location.hash);
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  const postings = hash.startsWith("#postings");
  const navigate = (value: string) => {
    window.location.hash = value;
    setHash(value);
  };
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
            CAREER FORM
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
          </nav>
        </div>
      </header>
      {postings ? (
        <JobPostings key={hash} initialCreate={hash === "#postings/new"} />
      ) : (
        <App />
      )}
    </>
  );
}
