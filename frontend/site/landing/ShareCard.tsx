import { SendToPc } from "./SendToPc";
import pointerArt from "./assets/C3.webp";
import brand from "./brand.module.css";
import styles from "./TrialScene.module.css";

/**
 * Phones cannot run the side-panel trial; offer to share or copy the link
 * so it can be opened later on a PC.
 */
export function ShareCard() {
  return (
    <div className={styles.share}>
      <img src={pointerArt} alt="" />
      <h3 id="share-title">PC Chrome에서 직접 해볼 수 있어요</h3>
      <p>
        커리어폼은 PC Chrome 확장 프로그램이에요. 링크를 공유해 두면 PC에서 바로
        체험으로 이어져요.
      </p>
      <div className={styles.shareButtons}>
        <SendToPc />
        <SendToPc copy className={brand.soft}>
          링크 복사
        </SendToPc>
      </div>
    </div>
  );
}
