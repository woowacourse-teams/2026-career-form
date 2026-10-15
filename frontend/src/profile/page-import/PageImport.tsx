import { findInvalidImportRows } from "./review-selection";
import { ImportTargetChoices } from "./ImportTargetChoices";
import {
  destination,
  displayValue,
  NAME_GROUPS,
  isName,
  groupKey,
  fieldLabel,
  skippedReason,
} from "./review-fields";
import { formatProfileDate } from "../../autofill/profile/date-format";
import { NameSplitEditor, initialNameParts } from "./NameSplitEditor";
import { presentImportSources } from "./source-presentation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  Profile,
  RepeatedProfileCategoryId,
  SingleProfileCategoryId,
} from "../model";
import { PROFILE_CATEGORIES } from "../field-definitions";
import type { ProfileRepository } from "../profile-repository";
import type { ImportCandidate } from "./reader";
import {
  IMPORT_ENTRY_KEYS,
  ImportConflictError,
  ImportSelectionError,
  saveImportSelection,
  type ImportSelection,
} from "./merge";
import styles from "./PageImport.module.css";
import css from "./PageImport.module.css?inline";

interface Props {
  repository: ProfileRepository;
  readCandidates(): Promise<readonly ImportCandidate[]>;
  onSaved(profile: Profile): void;
  onClose(): void;
}

export function PageImport({
  repository,
  readCandidates,
  onSaved,
  onClose,
}: Props) {
  const [baseline, setBaseline] = useState<Profile>();
  const [candidates, setCandidates] = useState<readonly ImportCandidate[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [confirmedNames, setConfirmedNames] = useState<Record<string, boolean>>(
    {},
  );
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const alive = useRef(false);
  const pending = useRef(false);
  const panel = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    alive.current = true;
    let active = true;
    setLoading(true);
    setError("");
    setBaseline(undefined);
    setCandidates([]);
    setSelected({});
    setTargets({});
    setEdits({});
    setConfirmedNames({});
    setStepIndex(0);
    void Promise.all([repository.load(), readCandidates()])
      .then(([profile, found]) => {
        if (!active) return;
        const initialEdits: Record<string, string> = Object.fromEntries(
          found
            .filter((c) => c.value && c.precision === "day")
            .map((c) => [c.source, c.value!]),
        );
        for (const group of NAME_GROUPS) {
          const candidate = found.find(
            (c) => c.source === group.source && c.status !== "unsupported",
          );
          if (!candidate?.value) continue;
          const parts = initialNameParts(
            candidate.value,
            group.source === "basicInformation.name" ? "korean" : "english",
          );
          initialEdits[group.keys[0][0]] = parts.familyName;
          initialEdits[group.keys[1][0]] = parts.givenName;
        }
        setBaseline(profile);
        setCandidates(found);
        setEdits(initialEdits);
      })
      .catch(() => {
        if (active)
          setError(
            "지원서 정보를 불러오지 못했습니다. 지원서 페이지에서 다시 시도해 주세요.",
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

  const usable = candidates.filter(
    (c) =>
      c.status !== "unsupported" && c.value && (isName(c) || destination(c)),
  );
  const fields = usable.filter((c) => destination(c));
  const groups = [
    ...new Set(
      fields.filter((c) => destination(c)!.category.repeatable).map(groupKey),
    ),
  ];
  const nameGroups = NAME_GROUPS.filter((group) =>
    usable.some((c) => c.source === group.source),
  );
  const steps = [
    ...nameGroups.map((group) => ({
      id: group.source,
      title: group.title,
      fields: usable.filter((c) => c.source === group.source),
    })),
    ...PROFILE_CATEGORIES.filter((category) => !category.repeatable).flatMap(
      (category) => {
        const items = fields.filter(
          (c) => destination(c)!.category.id === category.id,
        );
        return items.length
          ? [
              {
                id: category.id,
                title:
                  category.label + (category.sensitive ? " · 민감 정보" : ""),
                fields: items,
              },
            ]
          : [];
      },
    ),
    ...groups.map((key) => {
      const items = fields.filter((c) => groupKey(c) === key);
      return {
        id: key,
        title: `${destination(items[0])!.section.label} ${items[0].rowIndex! + 1}`,
        fields: items,
      };
    }),
  ];
  const step = steps[stepIndex];
  const summary = !step;
  const nameGroup = nameGroups.find((group) => group.source === step?.id);
  // Stable source list: editing a review value must not scroll the application again.
  const sources = JSON.stringify(step?.fields.map((c) => c.source) ?? []);
  useEffect(() => {
    if (loading || !panel.current) return;
    titleRef.current?.focus({ preventScroll: true });
    titleRef.current?.scrollIntoView?.({ block: "start", inline: "nearest" });
    return presentImportSources(
      panel.current.ownerDocument,
      JSON.parse(sources) as string[],
    );
  }, [sources, loading]);

  const rowInfo = (candidate: ImportCandidate) => {
    const { category, section } = destination(candidate)!;
    const key = groupKey(candidate);
    const rowFields = fields.filter((c) => groupKey(c) === key);
    const primary = IMPORT_ENTRY_KEYS[section.id][0];
    const name = rowFields
      .find((c) => destination(c)!.field.id === primary)
      ?.value?.trim();
    const entries =
      baseline?.[category.id as RepeatedProfileCategoryId].filter(
        (entry) => entry.sectionId === section.id,
      ) ?? [];
    const possibleDuplicate = entries.some(
      (entry) => entry.values[primary]?.trim() === name,
    );
    const targetValue =
      targets[key] ?? (name && !possibleDuplicate ? "new" : "");
    const target = entries.find(
      (entry) => `existing:${entry.id}` === targetValue,
    );
    return {
      key,
      rowFields,
      primary,
      name,
      entries,
      targetValue,
      target,
      section,
    };
  };
  const currentValue = (candidate: ImportCandidate) => {
    const { category, field } = destination(candidate)!;
    return category.repeatable
      ? rowInfo(candidate).target?.values[field.id]
      : baseline?.[category.id as SingleProfileCategoryId][field.id];
  };
  const valueFor = (candidate: ImportCandidate) =>
    destination(candidate)!.field.inputType === "date"
      ? (edits[candidate.source] ?? "")
      : candidate.value!;
  const ready = (candidate: ImportCandidate, selection = selected) => {
    const { category, field } = destination(candidate)!;
    if (category.repeatable && !rowInfo(candidate).targetValue) return false;
    const value = valueFor(candidate);
    if (!value.trim()) return false;
    if (
      field.inputType === "date" &&
      formatProfileDate(value, "YYYY-MM-DD").status !== "resolved"
    )
      return false;
    const existing = category.repeatable
      ? rowInfo(candidate).target?.values
      : baseline?.[category.id as SingleProfileCategoryId];
    const combined = { ...existing };
    for (const other of fields) {
      const dest = destination(other)!;
      if (
        dest.category.id === category.id &&
        (!category.repeatable || groupKey(other) === groupKey(candidate)) &&
        selection[other.source]
      )
        combined[dest.field.id] = valueFor(other);
    }
    combined[field.id] = value;
    if (field.visibleWhen && !field.visibleWhen(combined)) return false;
    const options = field.optionsFor?.(combined) ?? field.options;
    return (
      !options ||
      options.some(
        (option) =>
          (typeof option === "string" ? option : option.value) === value,
      )
    );
  };
  const effectiveSelected = (selection: Record<string, boolean>) => {
    const result: Record<string, boolean> = {};
    for (const c of fields)
      if (selection[c.source] && ready(c, selection)) result[c.source] = true;
    for (const group of nameGroups)
      if (confirmedNames[group.source])
        for (const [key] of group.keys)
          if (selection[key] && edits[key]?.trim()) result[key] = true;
    return result;
  };
  const chosen = effectiveSelected(selected);
  const checkedCount = Object.keys(chosen).length;
  const stepKeys = nameGroup
    ? nameGroup.keys.map(([key]) => key)
    : (step?.fields.map((c) => c.source) ?? []);
  const toggle = (candidate: ImportCandidate, checked: boolean) => {
    const next = { ...selected, [candidate.source]: checked };
    if (checked && destination(candidate)!.category.repeatable) {
      const row = rowInfo(candidate);
      if (row.targetValue === "new") {
        const primary = row.rowFields.find(
          (c) => destination(c)!.field.id === row.primary,
        );
        if (primary) next[primary.source] = true;
      }
    }
    if (!checked && destination(candidate)!.category.repeatable) {
      const row = rowInfo(candidate);
      if (
        row.targetValue === "new" &&
        destination(candidate)!.field.id === row.primary
      )
        for (const c of row.rowFields) next[c.source] = false;
    }
    setSelected(effectiveSelected(next));
  };
  const nextStep = () => {
    setError("");
    setStepIndex((index) => index + 1);
  };
  const takeStep = () => {
    const next = { ...selected };
    for (const key of stepKeys) next[key] = true;
    setSelected(effectiveSelected(next));
    nextStep();
  };
  const skipStep = () => {
    setSelected((current) => ({
      ...current,
      ...Object.fromEntries(stepKeys.map((key) => [key, false])),
    }));
    nextStep();
  };
  const skipped = candidates.filter((c) => !usable.includes(c));
  const skippedCounts = new Map<string, number>();
  for (const candidate of skipped) {
    const reason = skippedReason(
      candidate.status === "unsupported"
        ? candidate.reason
        : "no_profile_mapping",
    );
    skippedCounts.set(reason, (skippedCounts.get(reason) ?? 0) + 1);
  }

  const selection: ImportSelection = { single: {}, entries: [] };
  for (const group of nameGroups)
    for (const [key] of group.keys)
      if (chosen[key])
        selection.single!.personal = {
          ...selection.single!.personal,
          [key]: edits[key].trim(),
        };
  for (const candidate of fields) {
    if (!chosen[candidate.source]) continue;
    const { category, section, field } = destination(candidate)!;
    const value = valueFor(candidate);
    if (!category.repeatable) {
      const id = category.id as SingleProfileCategoryId;
      selection.single![id] = { ...selection.single![id], [field.id]: value };
      continue;
    }
    const row = rowInfo(candidate);
    let entry = selection.entries!.find(
      (entry) =>
        entry.categoryId === category.id &&
        entry.sectionId === section.id &&
        entry.sourceRow === candidate.rowIndex,
    );
    if (!entry) {
      entry = {
        categoryId: category.id as RepeatedProfileCategoryId,
        sectionId: section.id,
        sourceRow: candidate.rowIndex!,
        ...(row.targetValue === "new" ? {} : { targetId: row.target!.id }),
        values: {},
      };
      selection.entries!.push(entry);
    }
    entry.values[field.id] = value;
  }
  const invalidRows =
    baseline && summary ? findInvalidImportRows(baseline, selection) : [];
  const invalidKeys = new Set(
    invalidRows.map(
      (row) => `${row.categoryId}.${row.sectionId}.${row.sourceRow}`,
    ),
  );
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (
      pending.current ||
      !baseline ||
      !checkedCount ||
      !summary ||
      invalidRows.length
    )
      return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const saved = await saveImportSelection(repository, baseline, selection);
      if (alive.current) onSaved(saved);
    } catch (failure) {
      if (!alive.current) return;
      if (failure instanceof ImportSelectionError)
        setError(
          "선택한 정보를 확인해 주세요. 같은 항목이 이미 있다면 해당 단계로 돌아가 기존 정보 업데이트를 선택해 주세요. 새 항목에는 대표 이름이 필요합니다.",
        );
      else if (failure instanceof ImportConflictError) {
        setError(
          "검토 중 프로필이 변경되었습니다. 최신 값을 확인하고 가져올 항목을 다시 선택해 주세요.",
        );
        setSelected({});
        setTargets({});
        setConfirmedNames({});
        setStepIndex(0);
        try {
          const latest = await repository.load();
          if (alive.current) setBaseline(latest);
        } catch {
          if (alive.current) setBaseline(undefined);
        }
      } else setError("프로필을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      pending.current = false;
      if (alive.current) setSaving(false);
    }
  };

  const renderField = (candidate: ImportCandidate) => {
    const { field, category } = destination(candidate)!;
    const label = fieldLabel(candidate);
    const valid = ready(candidate);
    const missingDate =
      field.inputType === "date" &&
      formatProfileDate(valueFor(candidate), "YYYY-MM-DD").status !==
        "resolved";
    return (
      <div
        className={`${styles.field} ${!valid ? styles.needsReview : ""}`}
        key={candidate.source}
      >
        <label>
          <input
            type="checkbox"
            checked={Boolean(chosen[candidate.source])}
            disabled={!valid}
            onChange={(e) => toggle(candidate, e.target.checked)}
          />
          {label} 가져오기
        </label>
        <span>지원서 값: {displayValue(candidate.value, candidate)}</span>
        {field.inputType === "date" && (
          <label>
            {label} 확인
            <input
              type="date"
              value={edits[candidate.source] ?? ""}
              aria-invalid={missingDate}
              onChange={(e) => {
                setEdits({ ...edits, [candidate.source]: e.target.value });
                setSelected({ ...selected, [candidate.source]: false });
              }}
            />
          </label>
        )}
        {missingDate && (
          <small>
            확인 필요 · 정확한 연·월·일을 입력하면 선택할 수 있습니다. 모르면 이
            날짜를 제외하고 진행하세요.
          </small>
        )}
        {!valid && !missingDate && (
          <small>
            확인 필요 · 저장 위치 또는 관련 항목을 먼저 선택해 주세요.
          </small>
        )}
        {candidate.reason === "catalog_unverified" && (
          <small>
            직접 입력한 이름으로 저장됩니다. 검색 선택은 프로필 관리에서 할 수
            있습니다.
          </small>
        )}
        {category.repeatable &&
          rowInfo(candidate).targetValue === "new" &&
          destination(candidate)!.field.id === rowInfo(candidate).primary && (
            <small>새 항목을 추가할 때 이 이름이 함께 저장됩니다.</small>
          )}
        <small>
          기존 값: {displayValue(currentValue(candidate), candidate)}
        </small>
      </div>
    );
  };

  const repeated =
    step?.fields[0] && destination(step.fields[0])?.category.repeatable
      ? rowInfo(step.fields[0])
      : undefined;
  return (
    <section
      ref={panel}
      className={styles.importer}
      aria-label="지원서에서 프로필 가져오기"
    >
      <style>{css}</style>
      <h2>지원서에서 가져오기</h2>
      <p className={styles.hint}>
        항목별로 확인한 뒤 마지막에 저장합니다. 원본 입력란은 색 테두리로
        표시하며, 지원서 값·저장·제출은 변경하지 않습니다.
      </p>
      {loading && <p role="status">지원서 정보를 읽고 있습니다.</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {!loading && !usable.length && (
        <p>
          가져올 정보가 없습니다. Greeting 지원서에서 작성한 정보가 보이는지
          확인해 주세요.
        </p>
      )}
      {!loading && usable.length > 0 && baseline && (
        <form onSubmit={(e) => void save(e)}>
          <fieldset disabled={saving} className={styles.fields}>
            <legend>가져올 정보 확인</legend>
            <p className={styles.progress} aria-live="polite">
              {Math.min(stepIndex + 1, steps.length + 1)} / {steps.length + 1}{" "}
              단계 · {checkedCount}개 선택
            </p>
            <h3 ref={titleRef} tabIndex={-1}>
              {step?.title ?? "저장 전 확인"}
            </h3>
            {nameGroup && (
              <fieldset
                className={`${styles.group} ${!confirmedNames[nameGroup.source] ? styles.needsReview : ""}`}
              >
                <legend>{nameGroup.title}</legend>
                <NameSplitEditor
                  source={step.fields[0].value!}
                  language={
                    nameGroup.source === "basicInformation.name"
                      ? "korean"
                      : "english"
                  }
                  familyName={edits[nameGroup.keys[0][0]] ?? ""}
                  givenName={edits[nameGroup.keys[1][0]] ?? ""}
                  confirmed={Boolean(confirmedNames[nameGroup.source])}
                  onChange={(family, given) => {
                    setEdits({
                      ...edits,
                      [nameGroup.keys[0][0]]: family,
                      [nameGroup.keys[1][0]]: given,
                    });
                    setConfirmedNames({
                      ...confirmedNames,
                      [nameGroup.source]: false,
                    });
                    setSelected({
                      ...selected,
                      ...Object.fromEntries(
                        nameGroup.keys.map(([key]) => [key, false]),
                      ),
                    });
                  }}
                  onConfirm={() => {
                    setConfirmedNames({
                      ...confirmedNames,
                      [nameGroup.source]: true,
                    });
                    setSelected({
                      ...selected,
                      ...Object.fromEntries(
                        nameGroup.keys.map(([key]) => [key, true]),
                      ),
                    });
                  }}
                />
                {nameGroup.keys.map(([key, label]) => (
                  <div className={styles.field} key={key}>
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(chosen[key])}
                        disabled={
                          !confirmedNames[nameGroup.source] ||
                          !edits[key]?.trim()
                        }
                        onChange={(e) =>
                          setSelected({ ...selected, [key]: e.target.checked })
                        }
                      />
                      {label} 가져오기
                    </label>
                    <small>기존 값: {baseline.personal[key] || "없음"}</small>
                  </div>
                ))}
              </fieldset>
            )}
            {repeated && (
              <ImportTargetChoices
                name={repeated.name}
                primary={repeated.primary}
                entries={repeated.entries}
                targetValue={repeated.targetValue}
                groupId={step.id}
                onChange={(value) => {
                  setTargets({ ...targets, [repeated.key]: value });
                  setSelected({
                    ...selected,
                    ...Object.fromEntries(stepKeys.map((key) => [key, false])),
                  });
                }}
              />
            )}
            {!nameGroup && step?.fields.map(renderField)}
            {summary && (
              <>
                <p>
                  선택한 {checkedCount}개 값만 프로필에 저장합니다. 기존 값과
                  다르면 아래 값으로 바뀝니다.
                </p>
                {steps.map((item, index) => {
                  const group = nameGroups.find((g) => g.source === item.id);
                  const items = group
                    ? group.keys
                        .filter(([key]) => chosen[key])
                        .map(([key, label]) => ({
                          label,
                          value: edits[key],
                          current: baseline.personal[key],
                        }))
                    : item.fields
                        .filter((c) => chosen[c.source])
                        .map((c) => ({
                          label: fieldLabel(c),
                          value: displayValue(valueFor(c), c),
                          current: displayValue(currentValue(c), c),
                        }));
                  const row =
                    !group && destination(item.fields[0])!.category.repeatable
                      ? rowInfo(item.fields[0])
                      : undefined;
                  return (
                    <div
                      className={`${styles.group} ${invalidKeys.has(item.id) ? styles.needsReview : ""}`}
                      key={item.id}
                    >
                      {invalidKeys.has(item.id) && (
                        <p>
                          확인 필요 · 중복 항목 또는 같은 저장 위치가 있습니다.
                          이름·기간·저장 위치를 다시 확인하거나 제외해 주세요.
                        </p>
                      )}
                      <h4>
                        {item.title} ·{" "}
                        {items.length ? `${items.length}개 선택` : "제외"}
                      </h4>
                      {row && items.length > 0 && (
                        <p>
                          {row.targetValue === "new"
                            ? "새 정보로 추가"
                            : `기존 정보 업데이트: ${row.target?.values[row.primary] || "이름 없음"}`}
                        </p>
                      )}
                      {items.map((item) => (
                        <div className={styles.field} key={item.label}>
                          <strong>
                            {item.label}: {item.value}
                          </strong>
                          <small>기존 값: {item.current || "없음"}</small>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setStepIndex(index);
                          setError("");
                        }}
                      >
                        {item.title} 다시 확인
                      </button>
                    </div>
                  );
                })}
                {invalidRows.length > 0 && (
                  <div role="alert" className={styles.needsReview}>
                    <p>
                      저장 전 확인이 필요한 항목이 {invalidRows.length}개
                      있습니다. 표시한 단계에서 수정하거나 이 항목만 제외해
                      주세요.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setSelected((current) => ({
                          ...current,
                          ...Object.fromEntries(
                            fields
                              .filter((c) => invalidKeys.has(groupKey(c)))
                              .map((c) => [c.source, false]),
                          ),
                        }))
                      }
                    >
                      문제 항목 제외하고 계속
                    </button>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={!checkedCount || invalidRows.length > 0}
                >
                  {saving ? "저장 중…" : "선택한 정보 저장"}
                </button>
              </>
            )}
            <div className={styles.actions}>
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setStepIndex((index) => index - 1);
                    setError("");
                  }}
                >
                  이전
                </button>
              )}
              {step && (
                <>
                  {!nameGroup && (
                    <button
                      type="button"
                      onClick={takeStep}
                      disabled={
                        !step.fields.some((c) =>
                          ready(
                            c,
                            Object.fromEntries(
                              stepKeys.map((key) => [key, true]),
                            ),
                          ),
                        )
                      }
                    >
                      이 단계 가져오기
                    </button>
                  )}
                  <button type="button" onClick={nextStep}>
                    다음
                  </button>
                  <button type="button" onClick={skipStep}>
                    이 단계 건너뛰기
                  </button>
                </>
              )}
            </div>
            {step && (
              <p className={styles.hint}>
                {nameGroup
                  ? "이름을 확인하거나 건너뛸 수 있습니다."
                  : "이 단계 가져오기는 선택 가능한 항목만 포함합니다. 일부만 가져오려면 체크한 뒤 다음을 누르세요."}{" "}
                확인하지 못한 날짜는 제외해도 다른 정보는 저장할 수 있습니다.
              </p>
            )}
          </fieldset>
        </form>
      )}
      {!loading && skipped.length > 0 && (
        <details className={styles.hint} aria-label="제외한 항목">
          <summary>{skipped.length}개 항목 제외</summary>
          <ul>
            {[...skippedCounts].map(([reason, count]) => (
              <li key={reason}>
                {reason}: {count}개
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className={styles.actions}>
        {!loading && (!baseline || !usable.length) && (
          <button
            type="button"
            disabled={saving}
            onClick={() => setRetry((value) => value + 1)}
          >
            다시 읽기
          </button>
        )}
        <button type="button" disabled={saving} onClick={onClose}>
          가져오기 취소
        </button>
      </div>
    </section>
  );
}
