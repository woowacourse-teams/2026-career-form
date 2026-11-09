import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { addressVerification } from "../address";
import {
  searchAddress,
  type AddressSearchErrorCode,
  type AddressSearchPage,
  type AddressSearchResult,
  type StructuredAddress,
} from "../address-search";
import styles from "./AddressSearchPanel.module.css";

const ERROR_LABELS: Record<AddressSearchErrorCode, string> = {
  INVALID_INPUT: "검색어 확인",
  RATE_LIMITED: "잠시 후 다시",
  UNAVAILABLE: "검색 실패",
  NOT_CONFIGURED: "검색 미설정",
  NETWORK: "연결 실패",
};
const MAX_QUERY_LENGTH = 80;
const MAX_PAGE = 100;

type SearchState =
  | { status: "idle" | "loading" }
  | { status: "error"; code: AddressSearchErrorCode }
  | { status: "results"; query: string; result: AddressSearchPage };

export function AddressSearchPanel({
  contact,
  onSelect,
  search = searchAddress,
}: {
  contact: Record<string, string>;
  onSelect(address: StructuredAddress): void;
  search?: (query: string, page: number) => Promise<AddressSearchResult>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const latestRequest = useRef(0);
  const toggle = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const queryInput = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const verification = addressVerification(contact);

  const run = async (text: string, page: number) => {
    const request = ++latestRequest.current;
    setState({ status: "loading" });
    const result = await search(text, page);
    if (request !== latestRequest.current) return;
    setState(
      result.ok
        ? { status: "results", query: text, result }
        : { status: "error", code: result.code },
    );
  };

  // The query is personal data: nothing keeps it once the search closes.
  const close = () => {
    latestRequest.current += 1;
    dialog.current?.close();
    setOpen(false);
    setQuery("");
    setState({ status: "idle" });
    toggle.current?.focus();
  };

  const submit = () => {
    const text = query.trim();
    if (text) void run(text, 1);
  };

  useEffect(() => {
    if (!open || dialog.current?.open) return;
    dialog.current?.showModal();
    queryInput.current?.focus();
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };

  const results = state.status === "results" ? state : undefined;
  const totalPages = results
    ? Math.min(
        MAX_PAGE,
        Math.ceil(results.result.totalCount / results.result.pageSize),
      )
    : 0;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <button
          ref={toggle}
          type="button"
          className={styles.button}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          주소 검색
        </button>
        {verification === "unverified" && (
          <span className={styles.unverified}>검증 안 된 주소</span>
        )}
        {verification === "verified" && (
          <>
            <span className={styles.verified}>검증된 주소</span>
            {contact.jibunAddress && (
              <span className={styles.secondary}>{contact.jibunAddress}</span>
            )}
          </>
        )}
      </div>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        {open && (
          <>
            <div className={styles.titleRow}>
              <h2 id={titleId} className={styles.title}>
                주소 검색
              </h2>
              <button
                type="button"
                className={styles.closeButton}
                aria-label="닫기"
                onClick={close}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <div className={styles.queryRow}>
              <input
                ref={queryInput}
                className={styles.query}
                type="text"
                aria-label="주소 검색어"
                autoComplete="off"
                maxLength={MAX_QUERY_LENGTH}
                placeholder="도로명, 건물명"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  submit();
                }}
              />
              <button type="button" className={styles.button} onClick={submit}>
                검색
              </button>
            </div>
            {state.status === "loading" && (
              <p className={styles.message} role="status">
                검색 중
              </p>
            )}
            {state.status === "error" && (
              <p className={styles.error} role="alert">
                {ERROR_LABELS[state.code]}
              </p>
            )}
            {results && results.result.addresses.length === 0 && (
              <p className={styles.message} role="status">
                결과 없음
              </p>
            )}
            {results && results.result.addresses.length > 0 && (
              <ul className={styles.results} aria-label="주소 검색 결과">
                {results.result.addresses.map((address) => (
                  <li key={address.buildingManagementNumber}>
                    <button
                      type="button"
                      className={styles.result}
                      onClick={() => {
                        onSelect(address);
                        close();
                      }}
                    >
                      <span className={styles.road}>{address.roadAddress}</span>
                      <span className={styles.postal}>
                        {address.postalCode}
                      </span>
                      {address.jibunAddress && (
                        <span className={styles.secondary}>
                          {address.jibunAddress}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {results && totalPages > 1 && (
              <div className={styles.paging}>
                <button
                  type="button"
                  className={styles.button}
                  disabled={results.result.page <= 1}
                  onClick={() =>
                    void run(results.query, results.result.page - 1)
                  }
                >
                  이전
                </button>
                <span className={styles.secondary}>
                  {results.result.page} / {totalPages}
                </span>
                <button
                  type="button"
                  className={styles.button}
                  disabled={results.result.page >= totalPages}
                  onClick={() =>
                    void run(results.query, results.result.page + 1)
                  }
                >
                  다음
                </button>
              </div>
            )}
          </>
        )}
      </dialog>
    </div>
  );
}
