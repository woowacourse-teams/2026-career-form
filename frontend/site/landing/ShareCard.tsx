import { useState } from "react";
import { InstallLink, type InstallHandler } from "./BrandChrome";
import pointerArt from "./assets/C3.webp";
import brand from "./brand.module.css";
import styles from "./TrialScene.module.css";

/** Phones cannot run the side-panel trial; offer to send it to a PC instead. */
export function ShareCard({ onInstall }: { onInstall: InstallHandler }) {
  const [message, setMessage] = useState("");
  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#try`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "커리어폼 체험하기",
          text: "PC Chrome에서 열어보세요.",
          url,
        });
        setMessage("");
        return;
      }
      await navigator.clipboard.writeText(url);
      setMessage("링크를 복사했어요. PC에서 붙여넣어 열어보세요.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("공유하지 못했어요. 주소창의 링크를 복사해 주세요.");
    }
  };
  return (
    <div className={styles.share}>
      <img src={pointerArt} alt="" />
      <h3>PC Chrome에서 직접 해볼 수 있어요</h3>
      <button type="button" className={brand.primary} onClick={share}>
        PC로 링크 보내기
      </button>
      <InstallLink onInstall={onInstall} className={brand.soft} />
      <small role="status">{message}</small>
    </div>
  );
}
