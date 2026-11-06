import type { Profile, ProfileEntry } from "../model";
import type { Chapter } from "./QuickStartFields";
import styles from "./QuickStart.module.css";
export function QuickStartPicker({
  education,
  profile,
  selectEntry,
}: {
  education: boolean;
  profile: Profile;
  selectEntry: (
    chapter: Chapter,
    sectionId: string,
    existing?: ProfileEntry,
  ) => void;
}) {
  return (
    <>
      {(education ? ["education"] : ["careers", "projects"]).map((category) =>
        profile[category as Chapter]
          .filter((row) =>
            Object.values(row.values).some((value) => value.trim()),
          )
          .map((row) => (
            <button
              className={styles.existing}
              key={row.id}
              type="button"
              onClick={() =>
                selectEntry(category as Chapter, row.sectionId, row)
              }
            >
              기존 항목 수정:{" "}
              {row.values.schoolName ||
                row.values.companyName ||
                row.values.projectName ||
                "이름 없는 항목"}
            </button>
          )),
      )}
      <div className={styles.chapterChoices}>
        {(education
          ? [
              ["고등학교", "education", "highSchool"],
              ["대학교", "education", "university"],
              ["대학원", "education", "graduateSchool"],
            ]
          : [
              ["직장경력", "careers", "career"],
              ["프로젝트", "projects", "project"],
            ]
        ).map(([label, category, section]) => (
          <button
            key={section}
            aria-label={label}
            type="button"
            onClick={() => selectEntry(category as Chapter, section)}
          >
            <strong>{label}</strong>
            <span>새로 입력하기 →</span>
          </button>
        ))}
      </div>
    </>
  );
}
