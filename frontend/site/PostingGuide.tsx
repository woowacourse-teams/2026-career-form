import type { steps } from "./content";
import styles from "./Site.module.css";
import panelScreenshot from "./assets/posting-panel.png";
import formScreenshot from "./assets/posting-form.png";
import { NotificationDemo } from "./NotificationDemo";
import listScreenshot from "./assets/posting-list.png";

export const postingSteps: typeof steps = [
  {
    label: "사이드패널 열기",
    title: "커리어폼 사이드패널을 여세요.",
    description:
      "페이지의 커리어폼 아이콘이나 Chrome 퍼즐 메뉴에서 패널을 연 뒤, 지원 공고 관리로 이동하세요.",
    instructions: [
      [
        "지원 공고 관리 클릭하기",
        "패널 상단의 ‘지원 공고 관리’를 누르면 공고 목록이 열려요. ‘+ 공고 추가’를 눌러 등록을 시작하세요.",
      ],
    ],
  },
  {
    label: "공고 정보 입력",
    title: "공고 정보와 마감을 입력하세요.",
    description:
      "회사명, 직무, 공고 링크와 마감 시각을 입력하고 알림을 설정하세요.",
    instructions: [
      [
        "공고 정보 입력하기",
        "회사명, 직무, 공고 링크를 입력하세요. 마감 날짜와 시간은 실제 공고에서 직접 확인해 주세요.",
      ],
      [
        "알림 설정 후 저장하기",
        "기본 하루 전·2시간 전 알림을 사용하거나 원하는 시간과 분으로 변경한 뒤 ‘저장’을 누르세요.",
      ],
      [
        "알림 수신 환경 확인하기",
        "Chrome이 완전히 종료된 동안에는 알림이 뜨지 않으며, 절전·방해금지 설정에 따라 늦거나 차단될 수 있어요.",
      ],
    ],
  },
  {
    label: "지원 완료",
    title: "지원했다면 완료로 표시하세요.",
    description: "다가오는 마감을 확인하고, 끝낸 지원은 정리하세요.",
    instructions: [
      [
        "가까운 마감부터 확인하기",
        "저장한 공고에서 마감이 가까운 순으로 확인하세요. ‘공고 열기’를 눌러 실제 채용사이트에서 직접 지원하면 돼요.",
      ],
      [
        "지원 완료로 표시하기",
        "지원을 마쳤다면 ‘지원 완료로 표시’를 누르세요. 남은 알림이 취소되고 완료한 공고로 옮겨져요.",
      ],
    ],
  },
];

export function PostingGuide({ step }: { step: number }) {
  const screenshot = [panelScreenshot, formScreenshot, listScreenshot][step];
  return (
    <figure
      className={`${styles.postingGuide} ${step === 0 ? styles.panelScreenshotGuide : ""}`}
    >
      {step === 0 ? (
        <div className={styles.panelScreenshotTarget}>
          <img
            className={styles.postingScreenshot}
            src={screenshot}
            alt="사이드패널의 지원 공고 관리 버튼 위치"
          />
          <span className={styles.panelButtonHighlight} aria-hidden="true" />
          <svg
            className={styles.panelButtonCursor}
            viewBox="0 0 28 36"
            aria-hidden="true"
          >
            <path
              d="M2 2v27l7-7 6 12 5-3-6-11h11Z"
              fill="#111"
              stroke="#fff"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      ) : (
        <a
          className={styles.postingScreenshotLink}
          href={screenshot}
          target="_blank"
          rel="noreferrer"
          aria-label="실제 화면 크게 보기 (새 탭)"
        >
          <img
            className={styles.postingScreenshot}
            src={screenshot}
            alt={
              step === 2
                ? "실제 지원 공고 목록: 회사 정보, 마감 시각과 지원 완료로 표시 버튼"
                : "실제 새 공고 저장 화면: 회사명, 직무, 공고 링크, 마감 날짜·시간과 알림 설정"
            }
          />
        </a>
      )}
    </figure>
  );
}

export function PostingNotificationGuide() {
  return (
    <section
      className={styles.notificationPreview}
      aria-labelledby="notification-preview-title"
    >
      <div>
        <h2 id="notification-preview-title">설정한 시간에 이렇게 알려드려요</h2>
        <p>회사명과 마감 시각을 확인하고 바로 지원하세요.</p>
        <p>알림을 누르면 저장한 공고가 열려요.</p>
      </div>
      <NotificationDemo />
    </section>
  );
}
