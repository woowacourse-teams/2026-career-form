import {
  developerModeStore,
  isDeveloperBuild,
  useDeveloperMode,
  type DeveloperModeStore,
} from "../../src/autofill/debug/developer-mode";
import styles from "./DeveloperSettings.module.css";

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
    <section className={styles.settings} aria-labelledby="developer-settings">
      <h2 id="developer-settings" className={styles.title}>
        개발자 설정
      </h2>
      <div className={styles.row}>
        <div>
          <span id="developer-mode-label" className={styles.label}>
            개발자 모드
          </span>
          <p id="developer-mode-help" className={styles.help}>
            자동 기입 중 상세 진행 화면과 진단 로그를 표시합니다.
          </p>
        </div>
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
    </section>
  );
}
