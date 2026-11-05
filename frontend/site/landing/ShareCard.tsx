import { handoffMailto, handoffUrl } from "./handoff";
import { SendToPc } from "./SendToPc";
import pointerArt from "./assets/C3.webp";
import brand from "./brand.module.css";
import styles from "./TrialScene.module.css";

/**
 * Phones cannot run the side-panel trial; offer every way to carry the link
 * to a PC: the share sheet, a plain copy, and a mail to oneself for in-app
 * browsers that block both.
 */
export function ShareCard() {
  const url = handoffUrl(window.location);
  return (
    <div className={styles.share}>
      <img src={pointerArt} alt="" />
      <h3>PC Chrome에서 직접 해볼 수 있어요</h3>
      <p>
        커리어폼은 PC Chrome 확장 프로그램이에요. 링크를 보내 두면 PC에서 바로
        이 체험으로 이어져요.
      </p>
      <SendToPc />
      <div className={styles.shareMore}>
        <SendToPc copy className={brand.soft}>
          링크 복사
        </SendToPc>
        <a className={brand.soft} href={handoffMailto(url)}>
          메일로 보내기
        </a>
      </div>
      <code className={styles.shareUrl}>{url}</code>
    </div>
  );
}
