import { scenarioFields } from "./scenario";
import styles from "./ApplicationForm.module.css";
const sections = [
  {
    id: "basic",
    title: "기본정보",
    note: "지원자의 기본 인적사항과 연락처를 확인해 주세요.",
    fields: scenarioFields.filter((field) =>
      ["personal", "contact"].includes(field.categoryId),
    ),
  },
  {
    id: "education",
    title: "학력정보",
    note: "대학교 학력사항",
    fields: scenarioFields.filter((field) => field.categoryId === "education"),
  },
  {
    id: "languages",
    title: "어학정보",
    note: "공인 외국어 시험",
    fields: scenarioFields.filter((field) => field.categoryId === "languages"),
  },
  {
    id: "careers",
    title: "경력사항",
    note: "근무 이력",
    fields: scenarioFields.filter((field) => field.categoryId === "careers"),
  },
  {
    id: "qualifications",
    title: "자격 / 면허",
    note: "보유한 자격 및 면허 정보를 입력해 주세요.",
    fields: scenarioFields.filter(
      (field) => field.categoryId === "certifications",
    ),
  },
];
export function ApplicationForm() {
  return (
    <div className={styles.application} data-form-scroll>
      <header className={styles.header}>
        <strong className={styles.logo}>커리어폼</strong>
        <div className={styles.menu} aria-hidden="true">
          <span>Jobs</span>
          <span>Areas of Work</span>
          <span>Culture</span>
        </div>
        <span className={styles.example}>지원서 체험</span>
      </header>
      <div className={styles.content}>
        <p className={styles.breadcrumb}>
          My Page <span>›</span> 지원 현황 <span>›</span> 지원서 작성
        </p>
        <div className={styles.title}>
          <div>
            <p>커리어폼 · 신입 채용</p>
            <h1>지원서 작성</h1>
          </div>
          <span className={styles.badge}>예시 공고</span>
        </div>
        <ol className={styles.steps} aria-label="지원서 작성 단계">
          <li aria-current="step">
            <b>01</b> 지원정보
          </li>
          <li>
            <b>02</b> 자기소개서
          </li>
          <li>
            <b>03</b> 최종 확인
          </li>
        </ol>
        <div className={styles.information}>
          <strong>지원정보를 작성해 주세요.</strong>
          <p>
            이 화면은 커리어폼 체험용 지원서입니다. 예제 정보만 입력되며 실제
            지원서로 제출되지 않습니다.
          </p>
        </div>
        <nav className={styles.sectionNav} aria-label="지원정보 영역">
          {sections.map((section) => (
            <a key={section.id} href={`#sk-${section.id}`}>
              {section.title}
            </a>
          ))}
        </nav>
        {sections.map((section) => (
          <section
            key={section.id}
            id={`sk-${section.id}`}
            aria-labelledby={`sk-heading-${section.id}`}
            className={styles.section}
          >
            <div className={styles.sectionHeading}>
              <h2 id={`sk-heading-${section.id}`}>{section.title}</h2>
              <span>예제 정보 자동 입력</span>
            </div>
            <p className={styles.sectionNote}>{section.note}</p>
            <div className={styles.fields}>
              {section.fields.map(({ id, label, type }) => (
                <label key={id} htmlFor={id}>
                  <span>{label}</span>
                  <input
                    id={id}
                    name={id}
                    type={type}
                    autoComplete="off"
                    readOnly
                    tabIndex={-1}
                    placeholder=""
                  />
                </label>
              ))}
            </div>
          </section>
        ))}
        <footer className={styles.footer}>
          <strong>커리어폼</strong>
          <span>가상 지원서 · 입력 결과 확인용</span>
        </footer>
      </div>
    </div>
  );
}
