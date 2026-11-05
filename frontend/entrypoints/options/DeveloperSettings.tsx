import {
  developerModeStore,
  includeNeedsReviewStore as defaultIncludeNeedsReviewStore,
  isDeveloperBuild,
  useDeveloperMode,
  type DeveloperModeStore,
} from "../../src/autofill/debug/developer-mode";
import styles from "./DeveloperSettings.module.css";

const HELP = "자동 기입 중 상세 진행 화면과 진단 로그 표시";
const INCLUDE_HELP = "범용 자동 기입에서 확인 필요 항목도 함께 기입(실측용)";

export function DeveloperSettings({
  developerBuild = isDeveloperBuild(import.meta.env),
  store = developerModeStore,
  includeNeedsReviewStore = defaultIncludeNeedsReviewStore,
}: {
  developerBuild?: boolean;
  store?: DeveloperModeStore;
  includeNeedsReviewStore?: DeveloperModeStore;
}) {
  const [enabled, setEnabled] = useDeveloperMode(store);
  const [includeNeedsReview, setIncludeNeedsReview] = useDeveloperMode(
    includeNeedsReviewStore,
  );
  if (!developerBuild) return null;
  return (
    <>
      <div className={styles.row} title={HELP}>
        <span id="developer-mode-label" className={styles.label}>
          개발자 모드
        </span>
        <span className={styles.marker}>개발 빌드만</span>
        <span id="developer-mode-help" className={styles.help}>
          {HELP}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="developer-mode-label"
          aria-describedby="developer-mode-help"
          className={styles.switch}
          onClick={() => void setEnabled(!enabled)}
        >
          <span className={styles.thumb} />
        </button>
      </div>
      {enabled && (
        <div className={styles.row} title={INCLUDE_HELP}>
          <span id="include-needs-review-label" className={styles.label}>
            확인 필요 포함
          </span>
          <span id="include-needs-review-help" className={styles.help}>
            {INCLUDE_HELP}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={includeNeedsReview}
            aria-labelledby="include-needs-review-label"
            aria-describedby="include-needs-review-help"
            className={styles.switch}
            onClick={() => void setIncludeNeedsReview(!includeNeedsReview)}
          >
            <span className={styles.thumb} />
          </button>
        </div>
      )}
    </>
  );
}
