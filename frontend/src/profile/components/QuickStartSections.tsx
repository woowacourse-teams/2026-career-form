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
      <p className={styles.description}>
        {hasValues
          ? "등록한 정보로 시작하고, 나머지는 필요할 때 추가하세요."
          : "저장한 정보가 없다면 입력할 항목이 없을 수 있어요. 필요한 정보는 언제든 추가할 수 있어요."}
      </p>
      <ol className={styles.instructions}>
        <li>
          <strong>작성 중인 지원서 탭을 열어 주세요.</strong>
          <span>지금 지원서가 없다면 다음에 작성할 때 시작해도 괜찮아요.</span>
        </li>
        <li>
          <strong>Chrome 확장 프로그램에서 Career Form을 여세요.</strong>
          <span>페이지의 커리어폼 아이콘으로도 패널을 열 수 있어요.</span>
        </li>
        <li>
          <strong>패널의 ‘자동 기입’을 누르세요.</strong>
          <span>
            입력 예정 값과 항목을 확인하고 원하는 항목만 선택해 적용하세요.
          </span>
        </li>
      </ol>
      <OpeningGuide />
      <p className={styles.note}>지원서 저장과 제출은 직접 해 주세요.</p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onBack}>
          입력 이어가기
        </button>
        <button type="button" disabled={pending} onClick={onOpenProfile}>
          전체 프로필 편집
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
