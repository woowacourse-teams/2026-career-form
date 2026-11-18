import pageStyles from "../page-import/PageImport.module.css";
import pageCss from "../page-import/PageImport.module.css?inline";
import styles from "./ResumeImport.module.css";
import css from "./ResumeImport.module.css?inline";

interface Props {
  onResume(): void;
}

/** Step before any import: choose where the profile comes from. */
export function ImportSourceChoice({ onResume }: Props) {
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
