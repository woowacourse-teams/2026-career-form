import logo from "../public/side-panel-launcher-logo.png";
import { Icon } from "./Icons";
import styles from "./Guide.module.css";
import { useSiteUrl } from "./site-navigation";
function ChromeWindow() {
  return (
    <div className={styles.chrome} aria-hidden="true">
      <div className={styles.tabs}>
        <span className={styles.dots}>● ● ●</span>
        <span>채용사이트　×</span>＋
      </div>
      <div className={styles.address}>
        <span>←</span>
        <span>⟳</span>
        <div>ⓘ　채용사이트 / 지원서</div>
        <span className={styles.target}>
          <Icon name="puzzle" />
        </span>
        <span>⋮</span>
      </div>
      <div className={styles.menu}>
        <strong>확장 프로그램</strong>
        <p>이 사이트에서 사용</p>
        <div>
          <span className={styles.extensionTarget}>
            <img src={logo} alt="" />
            <span>Career Form</span>
            <span aria-hidden="true">↖</span>
          </span>
          <span className={styles.pin}>
            <Icon name="pin" />
          </span>
          ⋮
        </div>
        <small>확장 프로그램 관리</small>
      </div>
    </div>
  );
}
export function ChromeGuide() {
  return (
    <figure className={styles.figure}>
      <ChromeWindow />
      <figcaption>
        <strong>퍼즐 메뉴에서 Career Form 선택</strong>
        <span>
          강조된 Career Form 이름 영역을 누르면 패널이 열려요. 오른쪽 핀은 도구
          모음 고정용이에요.
        </span>
        <small>
          Chrome 기준 안내 그림입니다. 펼쳐진 메뉴는 위치 설명용이며 실제 화면과
          다를 수 있어요.
        </small>
      </figcaption>
    </figure>
  );
}
export function OpeningGuide() {
  return (
    <div className={styles.methods}>
      <figure className={styles.figure}>
        <div className={styles.application} aria-hidden="true">
          <strong>채용사이트 · 지원서 작성</strong>
          <p>이름</p>
          <div />
          <p>이메일</p>
          <div />
          <img src={logo} alt="" />
        </div>
        <figcaption>
          <strong>방법 1 · 페이지의 네모 아이콘</strong>
          <span>
            채용 지원 페이지에 들어가면 작은 네모 모양의 커리어폼 아이콘이
            표시돼요. <strong>이 아이콘을 클릭하세요.</strong>
          </span>
        </figcaption>
      </figure>
      <figure className={styles.figure}>
        <ChromeWindow />
        <figcaption>
          <strong>방법 2 · Chrome 퍼즐 메뉴</strong>
          <span>
            <strong>주소창 오른쪽 퍼즐 → Career Form을 선택하세요.</strong>
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
export function ServiceGuide({
  kind,
}: {
  kind: "profile" | "autofill" | "results";
}) {
  const siteUrl = useSiteUrl();
  return (
    <figure
      className={`${styles.figure} ${kind === "results" ? styles.resultFigure : ""}`}
    >
      <iframe
        title={
          kind === "profile"
            ? "프로필 관리 버튼 위치"
            : kind === "results"
              ? "구역별 결과 확인 체험"
              : "자동 기입 버튼 위치"
        }
        src={siteUrl(`/demo/?view=guide-${kind}`)}
        tabIndex={kind === "results" ? 0 : -1}
        inert={kind !== "results"}
      />
      <figcaption>
        <strong>
          {kind === "profile"
            ? "↑ 패널 상단의 프로필 관리"
            : kind === "results"
              ? "두 탭을 눌러 결과 확인 체험하기"
              : "↑ 패널 상단의 자동 기입"}
        </strong>
        <span>
          {kind === "results" ? (
            "두 탭에서 항목과 구역을 눌러보세요. 실제 프로필을 사용하지 않는 예시예요."
          ) : (
            <strong>
              테두리로 표시한 버튼을 설치된 커리어폼에서 누르세요.
            </strong>
          )}
        </span>
      </figcaption>
    </figure>
  );
}
