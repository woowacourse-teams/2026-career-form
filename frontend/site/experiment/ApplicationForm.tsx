import { scenarioFields } from "./scenario";
import demo from "../demo/Simulation.module.css";
import styles from "./Experiment.module.css";
export function ApplicationForm() {
  return (
    <div
      className={`${demo.application} ${styles.application}`}
      data-form-scroll
    >
      <div className={demo.company}>
        <b>NEXT COMPANY</b>
        <span>CAREERS</span>
      </div>
      <p className={demo.breadcrumb}>채용 공고 / 지원서 작성</p>
      <h1>입사지원서</h1>
      <div className={demo.progress}>
        <strong>01 기본 정보</strong>
        <span>02 경력·경험</span>
        <span>03 최종 확인</span>
      </div>
      <h2 className={demo.sectionTitle}>기본 인적사항</h2>
      <div className={demo.fields}>
        {scenarioFields.map(({ id, label }) => (
          <label key={id} htmlFor={id}>
            <span>{label}</span>
            <input
              id={id}
              name={id}
              type={id === "graduated" || id === "acquired" ? "date" : "text"}
              autoComplete="off"
              readOnly
              tabIndex={-1}
            />
          </label>
        ))}
      </div>
      <p className={demo.formNote}>가상 지원서와 예제 데이터입니다.</p>
    </div>
  );
}
