import { useEffect, useMemo, useState } from "react";

import { AutofillDemo } from "../../src/autofill-demo/AutofillDemo";
import type { Profile } from "../../src/profile/model";
import type { ProfileRepository } from "../../src/profile/profile-repository";
import {
  buildSearchItems,
  searchProfileItems,
} from "../../src/profile/profile-search";
import { ChromeProfileStorage } from "../../src/storage/chrome-profile-storage";
import styles from "./App.module.css";

interface AppProps {
  repository?: ProfileRepository;
  copyText?: (value: string) => Promise<void>;
}

type LoadStatus = "loading" | "ready" | "error";

export function App({
  repository: injectedRepository,
  copyText = (value) => navigator.clipboard.writeText(value),
}: AppProps) {
  const repository = useMemo(
    () => injectedRepository ?? new ChromeProfileStorage(),
    [injectedRepository],
  );
  const [profile, setProfile] = useState<Profile>();
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [copiedId, setCopiedId] = useState<string>();
  const [copyFailed, setCopyFailed] = useState(false);
  const [showAutofillDemo, setShowAutofillDemo] = useState(false);

  useEffect(() => {
    repository
      .load()
      .then((loadedProfile) => {
        setProfile(loadedProfile);
        setLoadStatus("ready");
      })
      .catch(() => setLoadStatus("error"));
  }, [repository]);

  const items = profile ? buildSearchItems(profile) : [];
  const results = searchProfileItems(items, query);

  const copy = async (id: string, value: string) => {
    try {
      setCopyFailed(false);
      await copyText(value);
      setCopiedId(id);
    } catch {
      setCopyFailed(true);
    }
  };

  if (showAutofillDemo) {
    return (
      <div className={styles.panel}>
        <AutofillDemo onExit={() => setShowAutofillDemo(false)} />
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <div>
          <p>CAREER FORM</p>
          <h1>내 프로필</h1>
        </div>
        <span>{items.length}개 값</span>
      </header>
      <main className={styles.main}>
        <label className={styles.search}>
          <span>프로필 검색</span>
          <input
            type="search"
            value={query}
            placeholder="범주 또는 필드 이름"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <section className={styles.results} aria-label="프로필 검색 결과">
          {loadStatus === "loading" && (
            <p className={styles.empty}>프로필을 불러오는 중입니다.</p>
          )}
          {loadStatus === "error" && (
            <p className={styles.empty} role="alert">
              프로필을 불러오지 못했습니다. 프로필 관리에서 다시 시도해 주세요.
            </p>
          )}
          {loadStatus === "ready" && results.length === 0 && (
            <div className={styles.empty}>
              <strong>검색 결과가 없습니다.</strong>
              <span>검색어를 지우거나 프로필 관리에서 정보를 추가하세요.</span>
            </div>
          )}
          {results.map((item) => {
            const isRevealed = !item.sensitive || revealed.has(item.id);
            return (
              <article className={styles.valueCard} key={item.id}>
                <div className={styles.valueMeta}>
                  <span>{item.categoryLabel}</span>
                  <strong>{item.fieldLabel}</strong>
                </div>
                <div className={styles.valueAction}>
                  <span className={isRevealed ? styles.value : styles.masked}>
                    {isRevealed ? item.value : "가려진 민감정보"}
                  </span>
                  {isRevealed ? (
                    <button
                      type="button"
                      aria-label={`${item.fieldLabel} 복사`}
                      onClick={() => void copy(item.id, item.value)}
                    >
                      {copiedId === item.id ? "복사됨" : "복사"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`${item.fieldLabel} 펼치기`}
                      onClick={() =>
                        setRevealed((current) => new Set(current).add(item.id))
                      }
                    >
                      펼치기
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {copyFailed && (
            <p className={styles.copyError} role="alert">
              클립보드에 복사하지 못했습니다. 브라우저 권한을 확인해 주세요.
            </p>
          )}
        </section>
      </main>
      <footer className={styles.footer}>
        <button type="button" onClick={() => setShowAutofillDemo(true)}>
          자동 기입
        </button>
        <p>분석 전에는 현재 페이지의 값을 읽거나 바꾸지 않습니다.</p>
      </footer>
    </div>
  );
}
