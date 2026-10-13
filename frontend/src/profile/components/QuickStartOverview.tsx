import type { Profile, ProfileEntry } from "../model";
import {
  basicSummary,
  Summary,
  type Chapter,
  type Step,
} from "./QuickStartFields";
import styles from "./QuickStart.module.css";

export function QuickStartOverview({
  profile,
  onEditBasic,
  onSelectEntry,
}: {
  profile: Profile;
  onEditBasic: (step: Step) => void;
  onSelectEntry: (chapter: Chapter, entry: ProfileEntry) => void;
}) {
  const basics = basicSummary(profile);
  return (
    <div className={styles.overview}>
      <section aria-label="저장한 기본 정보">
        <h2>기본 정보</h2>
        <Summary values={basics} onEdit={onEditBasic} />
        <div className={styles.supplementActions}>
          {basics
            .filter(([, value]) => !value.trim())
            .map(([label, , step]) => (
              <button
                key={label}
                type="button"
                aria-label={`${label} 수정`}
                onClick={() => step && onEditBasic(step)}
              >
                {label} 추가
              </button>
            ))}
        </div>
      </section>
      {(
        [
          ["education", "학력"],
          ["careers", "직장경력"],
          ["projects", "프로젝트"],
        ] as const
      ).map(([chapter, label]) => {
        const entries = profile[chapter].filter((entry) =>
          Object.values(entry.values).some((value) => value.trim()),
        );
        if (!entries.length) return null;
        return (
          <section key={chapter} aria-label={`저장한 ${label}`}>
            <h2>{label}</h2>
            <div className={styles.overviewCards}>
              {entries.map((entry) => {
                const displayName =
                  entry.values.schoolName?.trim() ||
                  entry.values.companyName?.trim() ||
                  entry.values.projectName?.trim() ||
                  "이름 없는 항목";
                return (
                  <button
                    className={styles.overviewCard}
                    key={entry.id}
                    type="button"
                    aria-label={`${displayName} 이어서 채우기`}
                    onClick={() => onSelectEntry(chapter, entry)}
                  >
                    <strong>{displayName}</strong>
                    <span>저장한 내용 확인 · 이어서 채우기 →</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
