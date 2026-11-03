import styles from "./WorkflowLoading.module.css";
import {
  batchPercent,
  type WriteProgress,
  type WorkflowActivity,
} from "./progress-model";
export type { WriteProgress } from "./progress-model";

export function WorkflowLoading({
  developerMode,
  writingImageUrl,
  total,
  done = 0,
  writing,
  statusMessage,
  currentCategory,
  activity = "matching",
  progress = [],
}: {
  developerMode: boolean;
  /** 확장 프로그램 리소스 URL. 없으면 이미지를 그리지 않는다. */
  writingImageUrl?: string;
  /** 현재 기입 묶음의 항목 수. */
  total?: number;
  /** 현재 기입 묶음에서 처리한 항목 수. */
  done?: number;
  writing: boolean;
  statusMessage?: string;
  currentCategory?: string;
  activity?: WorkflowActivity;
  progress?: readonly WriteProgress[];
}) {
  const message =
    statusMessage ??
    (writing
      ? currentCategory
        ? `${currentCategory} 정보를 입력하고 있어요`
        : "지원서에 입력하고 있어요"
      : {
          matching: "지원서 항목과 프로필 정보를 맞추고 있어요",
          preparing: "필요한 입력란을 준비하고 있어요",
          address: "주소 검색 결과를 확인하고 있어요",
        }[activity]);
  const percent =
    writing && total !== undefined && total > 0
      ? batchPercent(done, total)
      : undefined;
  if (!developerMode) {
    return (
      <>
        <p className={styles.announcement} role="status" aria-live="polite">
          {message}
        </p>
        <section
          className={styles.userView}
          aria-label="자동 기입 작업 영역"
          aria-busy="true"
        >
          {writingImageUrl && (
            <img
              className={styles.mascot}
              src={writingImageUrl}
              alt="지원서를 쓰는 카피바라"
            />
          )}
          <p className={styles.caption} aria-hidden="true">
            {writing ? "지원서를 채우고 있어요" : message}
          </p>
          <div className={styles.metric}>
            {percent !== undefined ? (
              <>
                <p className={styles.metricLabel}>진행률</p>
                <strong className={styles.value}>
                  {percent}
                  <small>%</small>
                </strong>
                <div className={styles.indicatorSlot}>
                  <div
                    className={styles.track}
                    role="progressbar"
                    aria-label="입력 완료 비율"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                  >
                    <span style={{ width: `${percent}%` }} />
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.indicatorSlot} aria-hidden="true">
                <div className={`${styles.track} ${styles.indeterminate}`}>
                  <span />
                </div>
              </div>
            )}
          </div>
        </section>
      </>
    );
  }
  const categories = [
    ...new Set([
      ...progress.map((entry) => entry.category),
      ...(writing && currentCategory ? [currentCategory] : []),
    ]),
  ];
  const written = progress.filter(
    (entry) => entry.status === "written" && !entry.unchanged,
  ).length;
  return (
    <>
      <p className={styles.announcement} role="status" aria-live="polite">
        {message}
      </p>
      <section
        className={styles.container}
        aria-label="자동 기입 작업 영역"
        aria-busy="true"
      >
        {!writing && (
          <p className={styles.status} aria-hidden="true">
            <span className={styles.activityDot} />
            {message}
          </p>
        )}
        <div className={styles.titleRow}>
          <h2 className={styles.total}>
            {writing && currentCategory
              ? `${currentCategory} 입력 중`
              : written > 0
                ? `${written}개 항목 입력`
                : "자동 기입"}
          </h2>
          {percent !== undefined && (
            <span className={styles.count}>
              {done} / {total}
            </span>
          )}
        </div>
        {percent !== undefined && (
          <div
            className={styles.track}
            role="progressbar"
            aria-label="입력 완료 비율"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
        )}
        {categories.length > 0 && (
          <ol className={styles.progress} aria-label="범주별 입력 현황">
            {categories.map((category) => {
              const entries = progress.filter(
                (entry) => entry.category === category,
              );
              const count = entries.filter(
                (entry) => entry.status === "written" && !entry.unchanged,
              ).length;
              const active = writing && category === currentCategory;
              return (
                <li key={category} data-active={active}>
                  <span className={styles.dot} aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {active ? (
                        <circle cx="12" cy="12" r="8" />
                      ) : count > 0 ||
                        entries.every((entry) => entry.unchanged) ? (
                        <path d="m5 12 5 5 9-10" />
                      ) : (
                        <path d="M6 12h12" />
                      )}
                    </svg>
                  </span>
                  <strong>{category}</strong>
                  <span>
                    {count > 0
                      ? `${count}개 입력`
                      : active
                        ? "입력 중"
                        : entries.every((entry) => entry.unchanged)
                          ? "기존 값 유지"
                          : "입력 보류"}
                    {active && count > 0 && <small>입력 중</small>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
}
