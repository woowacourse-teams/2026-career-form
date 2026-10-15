import { useEffect, useMemo, useRef, useState } from "react";
import type { Profile } from "../model";
import type { ProfileRepository } from "../profile-repository";
import { ImportCategoryList } from "./ImportCategoryList";
import { ImportConfirmCards } from "./ImportConfirmCards";
import { ImportSummary } from "./ImportSummary";
import {
  ImportConflictError,
  ImportSelectionError,
  saveImportSelection,
} from "./merge";
import type { ImportCandidate } from "./reader";
import { destination, isName, skippedReason } from "./review-fields";
import {
  buildReviewModel,
  defaultSelection,
  effectiveSelection,
  initialDecisions,
  isSelectable,
  rejectedGroups,
  toggleRows,
  toImportSelection,
  type ReviewDecisions,
} from "./review-model";
import styles from "./PageImport.module.css";
import css from "./PageImport.module.css?inline";
import reviewCss from "./ImportReview.module.css?inline";

interface Props {
  repository: ProfileRepository;
  readCandidates(): Promise<readonly ImportCandidate[]>;
  onSaved(profile: Profile, savedCount: number): void;
  onClose(): void;
}

const NO_DECISIONS: ReviewDecisions = { names: {}, dates: {}, targets: {} };

const usable = (candidate: ImportCandidate) =>
  candidate.status !== "unsupported" &&
  Boolean(candidate.value) &&
  (isName(candidate) || Boolean(destination(candidate)));

function skippedCounts(candidates: readonly ImportCandidate[]) {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    if (usable(candidate)) continue;
    const reason = skippedReason(
      candidate.status === "unsupported"
        ? candidate.reason
        : "no_profile_mapping",
    );
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return counts;
}

function startingState(
  candidates: readonly ImportCandidate[],
  profile: Profile,
) {
  const decisions = initialDecisions(candidates);
  const model = buildReviewModel(candidates, profile, decisions);
  return { decisions, selected: defaultSelection(model.rows) };
}

/** One-screen review: new values start selected, overwrites and sensitive values start off. */
export function PageImport({
  repository,
  readCandidates,
  onSaved,
  onClose,
}: Props) {
  const [baseline, setBaseline] = useState<Profile>();
  const [candidates, setCandidates] = useState<readonly ImportCandidate[]>([]);
  const [decisions, setDecisions] = useState(NO_DECISIONS);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const alive = useRef(false);
  const pending = useRef(false);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    alive.current = true;
    let active = true;
    setLoading(true);
    setError("");
    setBaseline(undefined);
    setCandidates([]);
    void Promise.all([repository.load(), readCandidates()])
      .then(([profile, found]) => {
        if (!active) return;
        const start = startingState(found, profile);
        setBaseline(profile);
        setCandidates(found);
        setDecisions(start.decisions);
        setSelected(start.selected);
      })
      .catch(() => {
        if (active)
          setError(
            "지원서 정보를 불러오지 못했어요. 지원서 페이지에서 다시 시도해 주세요.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      alive.current = false;
    };
  }, [repository, readCandidates, retry]);

  // Source highlighting on hover and focus is wired in the next step.
  const present = (_source: string | undefined) => {};

  const model = useMemo(
    () => baseline && buildReviewModel(candidates, baseline, decisions),
    [candidates, baseline, decisions],
  );
  const chosen =
    model && baseline ? effectiveSelection(model, selected, baseline) : {};
  const count = Object.keys(chosen).length;
  const duplicates =
    model && baseline ? rejectedGroups(model, selected, baseline).length : 0;
  const hasValues = candidates.some(usable);

  const decide = (next: ReviewDecisions) => {
    if (!model || !baseline) return;
    const after = buildReviewModel(candidates, baseline, next);
    const before = new Map(model.rows.map((row) => [row.key, row.status]));
    const moved = after.rows.filter((r) => before.get(r.key) !== r.status);
    // A decision restarts the affected rows like a fresh read: new values on,
    // overwrites and sensitive values off.
    const on = moved.filter((r) => r.status === "new" && !r.sensitive);
    const off = moved.filter((r) => !on.includes(r));
    setDecisions(next);
    setSelected((current) => {
      const cleared = toggleRows(
        after.rows,
        current,
        off.map((r) => r.key),
        false,
      );
      return toggleRows(
        after.rows,
        cleared,
        on.map((r) => r.key),
        true,
      );
    });
    setError("");
  };
  const toggle = (keys: readonly string[], checked: boolean) => {
    if (model) setSelected(toggleRows(model.rows, selected, keys, checked));
  };

  const recover = async () => {
    setError(
      "검토하는 동안 프로필이 바뀌었어요. 최신 프로필을 다시 불러왔으니 가져올 정보를 다시 확인해 주세요.",
    );
    try {
      const latest = await repository.load();
      if (!alive.current) return;
      const start = startingState(candidates, latest);
      setBaseline(latest);
      setDecisions(start.decisions);
      setSelected(start.selected);
    } catch {
      if (alive.current) setBaseline(undefined);
    }
  };
  const save = async () => {
    if (pending.current || !model || !baseline || !count) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const saved = await saveImportSelection(
        repository,
        baseline,
        toImportSelection(model, chosen),
      );
      if (alive.current) {
        present(undefined);
        onSaved(saved, count);
      }
    } catch (failure) {
      if (!alive.current) return;
      if (failure instanceof ImportConflictError) await recover();
      else if (failure instanceof ImportSelectionError)
        setError(
          "고른 정보 중 저장할 수 없는 항목이 있어요. 확인이 필요한 항목을 다시 확인해 주세요.",
        );
      else setError("프로필을 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      pending.current = false;
      if (alive.current) setSaving(false);
    }
  };

  const pendingCount = model?.confirmations.length ?? 0;
  const sensitiveOff = model?.rows.some(
    (row) => row.sensitive && isSelectable(row) && !chosen[row.key],
  );
  const note = pendingCount
    ? `확인하지 않은 ${pendingCount}개는 빼고 저장해요`
    : sensitiveOff
      ? "민감 정보는 직접 켜야 저장돼요"
      : "고른 정보만 저장하고, 지원서는 바꾸지 않아요";
  const skipped = skippedCounts(candidates);
  const skippedTotal = [...skipped.values()].reduce((sum, n) => sum + n, 0);

  return (
    <section
      ref={panel}
      className={styles.importer}
      aria-label="지원서에서 프로필 가져오기"
    >
      <style>
        {css}
        {reviewCss}
      </style>
      {loading && (
        <p role="status" className={styles.status}>
          지원서 정보를 읽고 있어요
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {!loading && !hasValues && (
        <p className={styles.empty}>
          가져올 정보가 없어요. Greeting 지원서에 쓴 내용이 화면에 보이는지
          확인해 주세요.
        </p>
      )}
      {!loading && hasValues && model && (
        <fieldset disabled={saving} className={styles.fields}>
          <legend hidden>가져올 정보 확인</legend>
          <ImportSummary rows={model.rows} chosen={chosen} />
          <ImportConfirmCards
            confirmations={model.confirmations}
            decisions={decisions}
            duplicateCount={duplicates}
            onDecide={decide}
            onPresent={present}
          />
          <ImportCategoryList
            rows={model.rows}
            chosen={chosen}
            decisions={decisions}
            onToggle={toggle}
            onPresent={present}
            onDecide={decide}
          />
          {skippedTotal > 0 && (
            <details className={styles.skipped}>
              <summary>가져올 수 없는 {skippedTotal}개 보기</summary>
              <ul>
                {[...skipped].map(([reason, n]) => (
                  <li key={reason}>
                    {reason}: {n}개
                  </li>
                ))}
              </ul>
            </details>
          )}
        </fieldset>
      )}
      <div className={styles.footer}>
        {!loading && hasValues && model && (
          <>
            <button
              type="button"
              className={styles.saveButton}
              disabled={!count || saving}
              aria-busy={saving}
              onClick={() => void save()}
            >
              프로필에 저장하기
              <span className={styles.badge}>{count}</span>
            </button>
            <p className={styles.footNote}>{note}</p>
          </>
        )}
        <div className={styles.exitActions}>
          {!loading && (!baseline || !hasValues) && (
            <button
              type="button"
              disabled={saving}
              onClick={() => setRetry((value) => value + 1)}
            >
              다시 읽기
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              present(undefined);
              onClose();
            }}
          >
            닫기
          </button>
        </div>
      </div>
    </section>
  );
}
