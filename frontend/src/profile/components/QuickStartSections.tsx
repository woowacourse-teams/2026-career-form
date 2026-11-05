import { OpeningGuide } from "../../../site/Guide";
import type { Profile, ProfileEntry } from "../model";
import type { Chapter } from "./QuickStartFields";
import styles from "./QuickStart.module.css";
export function QuickStartGuide({
  hasValues,
  pending,
  onBack,
  onOpenProfile,
}: {
  hasValues: boolean;
  pending: boolean;
  onBack: () => void;
  onOpenProfile: () => void;
}) {
  return (
    <>
      {!hasValues && <p className={styles.note}>저장한 정보 없음</p>}
      <ol className={styles.instructions}>
        <li>
          <strong>작성 중인 지원서 탭을 열어 주세요.</strong>
        </li>
        <li>
          <strong>Chrome 확장 프로그램에서 Career Form을 여세요.</strong>
        </li>
        <li>
          <strong>패널의 ‘자동 기입’을 누르세요.</strong>
        </li>
      </ol>
      <OpeningGuide />
      <p className={styles.note}>지원서 저장과 제출은 직접 해 주세요.</p>
      <div className={styles.foot}>
        <button type="button" disabled={pending} onClick={onOpenProfile}>
          전체 프로필 편집
        </button>
        <button
          type="button"
          className={styles.primary}
          disabled={pending}
          onClick={onBack}
        >
          입력 이어가기
        </button>
      </div>
    </>
  );
}
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
