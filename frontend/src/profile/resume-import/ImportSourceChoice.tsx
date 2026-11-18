import pageStyles from "../page-import/PageImport.module.css";
import pageCss from "../page-import/PageImport.module.css?inline";
import styles from "./ResumeImport.module.css";
import css from "./ResumeImport.module.css?inline";

interface Props {
  /** Absent when the current page has no application to read. */
  onPage?: () => void;
  onResume(): void;
}

/** Step before any import: the application page or a resume file. */
export function ImportSourceChoice({ onPage, onResume }: Props) {
  return (
    <section className={pageStyles.importer} aria-label="가져올 곳">
      <style>
        {pageCss}
        {css}
      </style>
      <ul className={styles.sourceList}>
        <li>
          <button
            type="button"
            className={styles.sourceItem}
            disabled={!onPage}
            onClick={onPage}
          >
            <span>
              <b>지원서 화면</b>
              <small>
                {onPage ? "Greeting 지원서" : "Greeting 지원서에서만"}
              </small>
            </span>
            <span className={styles.chevron} aria-hidden="true">
              ›
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={styles.sourceItem}
            onClick={onResume}
          >
            <span>
              <b>이력서 파일</b>
              <small>PDF · MD · TXT</small>
            </span>
            <span className={styles.chevron} aria-hidden="true">
              ›
            </span>
          </button>
        </li>
      </ul>
    </section>
  );
}
