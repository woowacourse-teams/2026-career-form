import { useEffect, useMemo, useRef, useState } from "react";

import type { LayoutPreference } from "../../src/profile/model";
import type { ProfileRepository } from "../../src/profile/profile-repository";
import { ProfileWorkspace } from "./ProfileWorkspace";
import { useProfileEditor } from "../../src/profile/hooks/use-profile-editor";
import {
  parseProfileImport,
  serializeProfileExport,
} from "../../src/profile/profile-transfer";
import { ChromeProfileStorage } from "../../src/storage/chrome-profile-storage";
import styles from "./App.module.css";

interface AppProps {
  repository?: ProfileRepository;
  confirmDelete?: (message: string) => boolean;
  confirmImport?: (message: string) => boolean;
  downloadProfile?: (fileName: string, contents: string) => void;
}

const SAVE_STATUS_LABEL = {
  idle: "자동 저장 켜짐",
  saving: "저장 중",
  saved: "저장됨",
  error: "저장 실패",
} as const;

function downloadProfile(fileName: string, contents: string) {
  const url = URL.createObjectURL(
    new Blob([contents], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function App({
  repository: injectedRepository,
  confirmDelete = (message) => globalThis.confirm(message),
  confirmImport = (message) => globalThis.confirm(message),
  downloadProfile: injectedDownloadProfile = downloadProfile,
}: AppProps) {
  const repository = useMemo(
    () => injectedRepository ?? new ChromeProfileStorage(),
    [injectedRepository],
  );
  const editor = useProfileEditor(repository);
  const [layout, setLayout] = useState<LayoutPreference | null>(null);
  const [layoutSaveFailed, setLayoutSaveFailed] = useState(false);
  const [transferFeedback, setTransferFeedback] = useState<{
    kind: "status" | "error";
    message: string;
  } | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    repository
      .loadLayout()
      .then(setLayout)
      .catch(() => setLayout("a"));
  }, [repository]);

  if (editor.loadStatus === "loading" || layout === null) {
    return <p className={styles.loading}>프로필을 불러오는 중입니다.</p>;
  }

  if (editor.loadStatus === "error") {
    return <p className={styles.loading}>프로필을 불러오지 못했습니다.</p>;
  }

  const changeLayout = (nextLayout: LayoutPreference) => {
    setLayout(nextLayout);
    setLayoutSaveFailed(false);
    void repository
      .saveLayout(nextLayout)
      .catch(() => setLayoutSaveFailed(true));
  };
  const exportProfile = () => {
    injectedDownloadProfile(
      "career-form-profile-v1.json",
      serializeProfileExport(editor.profile),
    );
    setTransferFeedback({ kind: "status", message: "프로필을 내보냈습니다." });
  };
  const importProfile = async (file: File) => {
    try {
      const importedProfile = parseProfileImport(await file.text());
      if (!confirmImport("현재 프로필 전체를 덮어씁니다. 계속할까요?")) return;

      const saved = await editor.replaceProfile(importedProfile);
      setTransferFeedback(
        saved
          ? { kind: "status", message: "프로필을 가져왔습니다." }
          : {
              kind: "error",
              message: "프로필을 저장하지 못했습니다. 다시 시도해 주세요.",
            },
      );
    } catch (error) {
      setTransferFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "가져오기 파일을 읽을 수 없습니다.",
      });
    }
  };
  const formProps = {
    profile: editor.profile,
    onAddEntry: editor.addEntry,
    onRemoveEntry: editor.removeEntry,
    onUpdateEntry: editor.updateEntry,
    onUpdateSingle: editor.updateSingle,
    confirmDelete,
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            <img
              className={styles.brandMark}
              src="/side-panel-launcher-logo.png"
              alt=""
            />
            CAREER FORM <span className={styles.brandDivider}>/</span>
            <span className={styles.brandSection}>MY PROFILE</span>
          </p>
          <h1>프로필 관리</h1>
          <p className={styles.description}>
            한 번 정리해 두면, 다음 지원이 더 가벼워져요.
          </p>
        </div>
        <div className={styles.toolbar}>
          <div className={styles.transferActions}>
            <button type="button" onClick={exportProfile}>
              내보내기
            </button>
            <button type="button" onClick={() => importInput.current?.click()}>
              가져오기
            </button>
            <input
              ref={importInput}
              className={styles.importInput}
              type="file"
              accept=".json,application/json"
              aria-label="프로필 JSON 파일"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void importProfile(file);
              }}
            />
          </div>
          <div className={styles.saveState} role="status" aria-live="polite">
            <span data-status={editor.saveStatus} />
            {SAVE_STATUS_LABEL[editor.saveStatus]}
            {editor.saveStatus === "error" && (
              <button type="button" onClick={() => void editor.retrySave()}>
                다시 시도
              </button>
            )}
          </div>
        </div>
      </header>

      {transferFeedback && (
        <p
          className={
            transferFeedback.kind === "error"
              ? styles.transferError
              : styles.transferStatus
          }
          role={transferFeedback.kind === "error" ? "alert" : "status"}
        >
          {transferFeedback.message}
        </p>
      )}

      <div className={styles.workspaceToolbar}>
        <p>
          필요한 정보만 입력하세요.{" "}
          <span>변경 내용은 이 브라우저에 자동 저장됩니다.</span>
        </p>
        <div className={styles.layoutSwitch} aria-label="프로필 레이아웃 선택">
          {(["a", "b"] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={layout === candidate}
              onClick={() => changeLayout(candidate)}
            >
              {candidate === "a" ? "항목별 보기" : "전체 보기"}
            </button>
          ))}
        </div>
      </div>
      {layoutSaveFailed && (
        <p className={styles.preferenceError} role="alert">
          레이아웃 선택을 저장하지 못했습니다. 현재 화면에서는 선택한 레이아웃을
          계속 사용할 수 있습니다.
        </p>
      )}

      <ProfileWorkspace layout={layout} formProps={formProps} />
      <footer className={styles.pageFooter}>
        <span>CAREER FORM</span>
        <details className={styles.storageNote}>
          <summary>내 정보는 암호화 없이 이 브라우저에 저장돼요</summary>
          <p>
            프로필은 암호화 없이 Chrome 로컬 저장소에 보관됩니다. 같은 브라우저
            프로필이나 기기에 접근할 수 있는 사람에게 보일 수 있습니다.
          </p>
        </details>
      </footer>
    </div>
  );
}
