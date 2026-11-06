import logo from "../../../../site/landing/assets/logo.webp";
import styles from "./Scene.module.css";

export type FieldId = "name" | "english" | "gender" | "birth";

// A made-up applicant; nothing here comes from a real application.
export const SAMPLE_VALUES: Record<FieldId, string> = {
  name: "김하늘",
  english: "Kim Haneul",
  gender: "여성",
  birth: "2000-02-23",
};

const sections = [
  "기본정보",
  "인적사항",
  "병역 / 취업우대",
  "학력사항",
  "어학 / 자격 / 활동",
  "제출서류",
  "자기소개서",
  "지원정보",
];

function Field({
  label,
  required = false,
  value,
  active,
  select = false,
}: {
  label: string;
  required?: boolean;
  value: string;
  active: boolean;
  select?: boolean;
}) {
  return (
    <div className={styles.gField}>
      <span className={styles.gLabel}>
        {label}
        {required && <i>*</i>}
      </span>
      <span className={styles.gInput} data-active={active} data-empty={!value}>
        {/* Keyed by value so a newly filled value plays its entrance. */}
        <span
          key={value || "empty"}
          data-field={label}
          className={styles.gValue}
        >
          {value || (select ? "선택" : "")}
        </span>
        {select && <span className={styles.gChevron} />}
      </span>
    </div>
  );
}

/**
 * A Greeting-style application form for a made-up company, with the page's
 * Career Form launcher. `values` holds what is filled in so far.
 */
export function GreetingPage({
  values,
  active,
  photo,
  launcher,
  pressed,
}: {
  values: Partial<Record<FieldId, string>>;
  active?: FieldId;
  photo: boolean;
  launcher: boolean;
  pressed?: string;
}) {
  return (
    <div className={styles.page}>
      <div className={styles.gHeader}>
        <span className={styles.gLogo}>
          haneul<b>corp.</b>
        </span>
        <span className={styles.gMenu}>
          <span>Join Us</span>
          <span>Benefits</span>
          <span>STORY</span>
          <span>FAQ</span>
          <span>한국어</span>
        </span>
      </div>
      <div className={styles.gMain}>
        <span className={styles.gBack}>←</span>
        <p className={styles.gDeadline}>
          제출 마감일 <b>2026. 11. 23. 23:59</b> <em>D-17</em>
        </p>
        <p className={styles.gTitle}>[신입] 백엔드 개발자 채용</p>
        <p className={styles.gCrumb}>개발 | 백엔드 | 신입 | 하늘상사</p>
        <div className={styles.gSection}>
          <b>기본정보</b>
          <small>
            <i>*</i>표시는 필수 입력 항목입니다.
          </small>
        </div>
        <Field
          label="이름"
          required
          value={values.name ?? ""}
          active={active === "name"}
        />
        <Field
          label="영문이름"
          value={values.english ?? ""}
          active={active === "english"}
        />
        <div className={styles.gField}>
          <span className={styles.gLabel}>
            사진<i>*</i>
          </span>
          <span className={styles.gPhotoRow}>
            <span className={styles.gPhoto} data-filled={photo}>
              <span />
            </span>
            <small>
              용량 제한: 3MB
              <br />
              지원 형식: JPG, JPEG, PNG
            </small>
          </span>
        </div>
        <Field
          label="성별"
          value={values.gender ?? ""}
          active={active === "gender"}
          select
        />
        <Field
          label="생년월일"
          required
          value={values.birth ?? ""}
          active={active === "birth"}
        />
      </div>
      <div className={styles.gNav}>
        <ol>
          {sections.map((section, index) => (
            <li key={section} data-current={index === 0}>
              {section}
            </li>
          ))}
        </ol>
        <span className={styles.gSubmit}>제출하기</span>
      </div>
      <span
        className={styles.launcher}
        data-cursor="launcher"
        data-visible={launcher}
        data-pressed={pressed === "launcher"}
      >
        <img src={logo} alt="" />
      </span>
      <span className={styles.rest} data-cursor="rest" />
    </div>
  );
}
