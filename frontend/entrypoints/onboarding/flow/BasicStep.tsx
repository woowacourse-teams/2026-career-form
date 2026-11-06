import type { RefObject } from "react";
import type { Profile } from "../../../src/profile/model";
import clipboardArt from "../../../site/landing/assets/C1.webp";
import pointerArt from "../../../site/landing/assets/C3.webp";
import { Coach } from "./Coach";
import styles from "./Flow.module.css";

type UpdateSingle = (
  category: "personal" | "contact",
  field: string,
  value: string,
) => void;

/** Steps 1 and 2: one question each, saved through the shared profile editor. */
export function BasicStep({
  step,
  profile,
  updateSingle,
  heading,
  busy,
  saved,
  onBack,
  onNext,
}: {
  step: "name" | "email";
  profile: Profile;
  updateSingle: UpdateSingle;
  heading: RefObject<HTMLHeadingElement | null>;
  busy: boolean;
  saved: boolean;
  onBack?: () => void;
  onNext: () => void;
}) {
  const family = profile.personal.koreanFamilyName ?? "";
  const given = profile.personal.koreanGivenName ?? "";
  const email = profile.contact.email ?? "";
  const filled =
    step === "name" ? Boolean(family.trim() || given.trim()) : !!email.trim();
  return (
    <div className={styles.stage}>
      <section className={styles.card}>
        <div className={styles.hg}>
          <p className={styles.eye}>
            {step === "name" ? "설치가 끝났어요" : "기본 정보"}
          </p>
          <h1 ref={heading} tabIndex={-1}>
            {step === "name" ? "이름부터 알려 주세요" : "이메일"}
          </h1>
          <p className={styles.lead}>
            {step === "name"
              ? "지원서의 이름 칸에 그대로 들어가요. 나중에 입력해도 돼요."
              : "지원서의 이메일 칸에 들어갈 주소예요."}
          </p>
        </div>
        <form
          className={styles.col}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) onNext();
          }}
        >
          {step === "name" ? (
            <div className={styles.fields}>
              <label className={styles.fld}>
                성
                <input
                  autoComplete="family-name"
                  placeholder="예: 홍"
                  value={family}
                  onChange={(event) =>
                    updateSingle(
                      "personal",
                      "koreanFamilyName",
                      event.target.value,
                    )
                  }
                />
              </label>
              <label className={styles.fld}>
                이름
                <input
                  autoComplete="given-name"
                  placeholder="예: 길동"
                  value={given}
                  onChange={(event) =>
                    updateSingle(
                      "personal",
                      "koreanGivenName",
                      event.target.value,
                    )
                  }
                />
              </label>
            </div>
          ) : (
            <div className={styles.fields}>
              <label className={styles.fld}>
                이메일
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(event) =>
                    updateSingle("contact", "email", event.target.value)
                  }
                />
              </label>
            </div>
          )}
          <div className={styles.foot}>
            <p className={saved ? styles.saved : styles.sm} role="status">
              {saved ? "저장됨" : "입력하면 이 브라우저에 자동 저장돼요."}
            </p>
            <div className={styles.acts}>
              {onBack && (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.ghost}`}
                  disabled={busy}
                  onClick={onBack}
                >
                  이전
                </button>
              )}
              <button
                type="submit"
                className={`${styles.btn} ${filled ? styles.pri : styles.soft}`}
                disabled={busy}
              >
                {filled ? "다음" : "건너뛰기"}
              </button>
            </div>
          </div>
        </form>
      </section>
      {step === "name" ? (
        <Coach art={clipboardArt}>
          <b>입력은 이름과 이메일뿐이에요</b>
          <p>나머지 단계는 알림 설정과 사용법 안내예요. 1분이면 끝나요.</p>
        </Coach>
      ) : (
        <Coach art={pointerArt} flip label="입력 안내">
          <b>지원서에서는 이렇게 들어가요</b>
          <div className={styles.rows} aria-hidden="true">
            <div className={`${styles.row} ${styles.ok}`}>
              <span>이름</span>
              <b>{`${family}${given}` || "홍길동"}</b>
            </div>
            <div className={`${styles.row} ${styles.hot}`}>
              <span>이메일</span>
              <b>{email}</b>
            </div>
          </div>
          <p className={styles.sm}>
            지원서 옆에 뜨는 Career Form 창에서 ‘자동 기입’을 누르면 채워져요.
          </p>
        </Coach>
      )}
    </div>
  );
}
