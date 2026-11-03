import {
  ANALYSIS_LOG,
  ANALYSIS_RESULT,
  CERTAINTY_WORD,
  CONFIDENCE_EXAMPLES,
  EDUCATION_ITEMS,
  FIELD_GROUPS,
  PROFILE_ITEMS,
  certainty,
  percent,
} from "./jev";
import { SAMPLE_NAME, sampleFields } from "./sample-form";
import logo from "./assets/logo.webp";
import sparkleArt from "./assets/O2.webp";
import styles from "./JevConsole.module.css";

/** Front: the CareerForm side panel. Back: the 의사결정 AI(JEV) console. */
export function JevConsole() {
  return (
    <div className={styles.console} data-ai="console">
      <div className={styles.flip} data-ai="flip">
        <div className={`${styles.face} ${styles.front}`} aria-hidden="true">
          <div className={styles.panelHead}>
            <img src={logo} alt="" />
            커리어폼
          </div>
          <p className={styles.greet}>
            <b>{SAMPLE_NAME}</b>님, 지원서를 열었어요.
          </p>
          <div className={styles.ghost} data-ai="ghost">
            <img src={sparkleArt} alt="" />
            자동 기입
          </div>
          <div className={styles.card}>
            <b>프로필 관리</b>
            <span>이름, 학력, 경력을 모아둬요</span>
          </div>
          <div className={styles.card}>
            <b>지원 공고 관리</b>
            <span>마감 알림을 받을 공고 3개</span>
          </div>
        </div>
        <div className={`${styles.face} ${styles.back}`}>
          <div className={styles.head}>
            <i className={styles.live} aria-hidden="true" />
            <span>의사결정 AI · JEV</span>
            <b data-ai="clock">0.0초</b>
          </div>
          <ConsoleViews />
        </div>
      </div>
    </div>
  );
}

function ConsoleViews() {
  return (
    <>
      <div className={styles.view} data-ai-view="split">
        <p className={styles.title}>지원서 읽는 중</p>
        <ol className={styles.log}>
          {ANALYSIS_LOG.map(([before, key, after]) => (
            <li key={key} data-ai-log>
              {before}
              <b>{key}</b>
              {after}
            </li>
          ))}
        </ol>
      </div>
      <div className={styles.view} data-ai-view="class">
        <p className={styles.title}>묶음 종류 판단</p>
        <div className={styles.classes}>
          {FIELD_GROUPS.map((g) => (
            <div key={g.name} className={styles.cls} data-ai-class>
              <span>{g.name}</span>
              <b>확신 0%</b>
              <i>
                <u />
              </i>
              <small>{g.note}</small>
            </div>
          ))}
        </div>
      </div>
      <CandidateView />
      <ConfidenceView />
      <ResultView />
    </>
  );
}

function CandidateView() {
  return (
    <div className={styles.view} data-ai-view="cand">
      <p className={styles.title}>출신 학교 · 후보 좁히기</p>
      <p className={styles.count}>
        <b>{PROFILE_ITEMS.length}</b>
        <span>프로필 항목</span>
        <i>→</i>
        <b data-ai="candTo">{PROFILE_ITEMS.length}</b>
        <span>학력 후보</span>
      </p>
      <div className={styles.cloud} data-ai="cloudBox">
        {PROFILE_ITEMS.map((item) => (
          <span
            key={item}
            className={styles.chip}
            data-education={EDUCATION_ITEMS.includes(item) || undefined}
            data-ai-chip
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function ConfidenceView() {
  return (
    <div className={styles.view} data-ai-view="conf">
      <p className={styles.title}>AI가 얼마나 확신하는지</p>
      <div className={styles.gauge}>
        <div className={styles.z0}>비워 둠</div>
        <div className={styles.z1}>확인 뒤 채움</div>
        <div className={styles.z2}>바로 채움</div>
        <i className={styles.tick} style={{ left: "50%" }}>
          <em>50%</em>
        </i>
        <i className={styles.tick} style={{ left: "80%" }}>
          <em>80%</em>
        </i>
        {CONFIDENCE_EXAMPLES.map(([field]) => (
          <i
            key={field}
            className={styles.pin}
            data-certainty={certainty(sampleFields[field].confidence)}
            style={{ left: percent(sampleFields[field].confidence) }}
            data-ai-pin
          />
        ))}
      </div>
      <ul className={styles.marks}>
        {CONFIDENCE_EXAMPLES.map(([field, what]) => {
          const c = sampleFields[field].confidence;
          return (
            <li key={field} data-certainty={certainty(c)} data-ai-mark>
              <span>{sampleFields[field].label}</span>
              <b>
                {CERTAINTY_WORD[certainty(c)]} {percent(c)}
              </b>
              <small>{what}</small>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ResultView() {
  const r = ANALYSIS_RESULT;
  return (
    <div className={styles.view} data-ai-view="result">
      <p className={styles.title}>분석 완료</p>
      <p className={styles.big}>
        <b data-ai="bigNum">0.0</b>
        <span>초</span>
      </p>
      <p className={styles.bigCaption}>칸 {r.fields}개 지원서 분석 시간</p>
      <div className={styles.compare}>
        <div>
          <span>이전 방식</span>
          <i>
            <u data-ai="barOld" />
          </i>
          <b>{r.previousSeconds}초</b>
        </div>
        <div>
          <span>의사결정 AI</span>
          <i>
            <u className={styles.fast} data-ai="barNew" />
          </i>
          <b>{r.seconds}초</b>
        </div>
      </div>
      <div className={styles.kpis} data-ai="kpis">
        <p>
          <b>{r.speedup}</b>빨라짐
        </p>
        <p>
          <b>{r.linked}</b>칸 연결 성공
        </p>
        <p>
          <b>{r.wrongValues}</b>틀린 값 입력
        </p>
      </div>
      <p className={styles.foot}>{r.footnote}</p>
    </div>
  );
}
