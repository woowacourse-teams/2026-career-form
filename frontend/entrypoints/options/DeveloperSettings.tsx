import {
  developerModeStore,
  isDeveloperBuild,
  useDeveloperMode,
  type DeveloperModeStore,
} from "../../src/autofill/debug/developer-mode";
import styles from "./DeveloperSettings.module.css";

const HELP = "자동 기입 중 상세 진행 화면과 진단 로그 표시";

export function DeveloperSettings({
  developerBuild = isDeveloperBuild(import.meta.env),
  store = developerModeStore,
}: {
  developerBuild?: boolean;
  store?: DeveloperModeStore;
}) {
  const [enabled, setEnabled] = useDeveloperMode(store);
  if (!developerBuild) return null;
  return (
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
  );
}
