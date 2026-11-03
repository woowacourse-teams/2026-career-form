import type { TrackEvent } from "../../src/analytics/events";
import type { PushClient } from "../../src/job-postings/push-client";
import type { OnboardingStart } from "../../site/SiteApp";
import { NotificationTile } from "./NotificationTile";
import styles from "./App.module.css";

function Flow({ items }: { items: string[] }) {
  return (
    <ol className={styles.flow}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ol>
  );
}

export function StartScreen({
  start,
  pushClient,
  track,
}: {
  start: OnboardingStart;
  pushClient: PushClient;
  track: TrackEvent;
}) {
  return (
    <main id="main" className={styles.wrap}>
      <h1 ref={start.heading} tabIndex={-1}>
        설치 완료
      </h1>
      <div className={styles.tiles}>
        <section className={styles.tile}>
          <h2>자동 기입</h2>
          <Flow items={["프로필 등록", "자동 기입", "결과 확인"]} />
          <div className={styles.btns}>
            <button
              type="button"
              className={styles.filled}
              aria-label="자동 기입 준비하기"
              onClick={start.autofill}
            >
              자동 기입 준비
            </button>
          </div>
        </section>
        <section className={styles.tile}>
          <h2>공고 저장</h2>
          <Flow items={["패널에서 시작", "새 공고에서 저장", "지원 완료"]} />
          <div className={styles.btns}>
            <button
              type="button"
              className={styles.outline}
              aria-label="공고 저장부터 시작하기"
              onClick={start.postings}
            >
              공고 저장 시작
            </button>
          </div>
        </section>
        <NotificationTile client={pushClient} track={track} />
      </div>
      <dl className={styles.facts}>
        <dt>Chrome 종료 중</dt>
        <dd>알림 없음</dd>
        <dt>절전·방해 금지</dt>
        <dd>늦거나 차단될 수 있음</dd>
        <dt>OS 알림 꺼짐</dt>
        <dd>아이콘 숫자와 새 공고 탭으로 확인</dd>
        <dt>저장 위치</dt>
        <dd>공고와 프로필 모두 이 브라우저</dd>
      </dl>
    </main>
  );
}
