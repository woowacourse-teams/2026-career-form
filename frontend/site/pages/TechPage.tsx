import { ClosingCta, type InstallHandler } from "../landing/BrandChrome";
import inspectArt from "../landing/assets/C2.webp";
import { SubPage } from "./SubPage";
import { TechMatching } from "./TechMatching";
import { TechNotifications } from "./TechNotifications";
import styles from "./TechPage.module.css";

export function TechPage({ onInstall }: { onInstall: InstallHandler }) {
  return (
    <SubPage
      path="/tech/"
      title="커리어폼은 이렇게 동작해요"
      lead="자동 기입이 지원서 칸을 연결하는 방법과, 마감 알림이 브라우저에 도착하는 방법을 정리했어요."
      art={inspectArt}
      artAlt="돋보기로 살펴보는 카피바라"
      onInstall={onInstall}
      heroExtra={
        <nav className={styles.topics} aria-label="주제">
          <a href="#matching">자동 기입</a>
          <a href="#notifications">공고 알림</a>
        </nav>
      }
    >
      <TechMatching />
      <TechNotifications />
      <div className={styles.closing}>
        <ClosingCta onInstall={onInstall} />
      </div>
    </SubPage>
  );
}
