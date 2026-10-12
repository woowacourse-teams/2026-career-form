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

function destination(candidate: ImportCandidate) {
  const [categoryId, sectionId, fieldId, extra] =
    candidate.profileFieldKey?.split(".") ?? [];
  if (extra) return undefined;
  const category = PROFILE_CATEGORIES.find((item) => item.id === categoryId);
  const section = category?.sections.find((item) => item.id === sectionId);
  const field = section?.fields.find((item) => item.id === fieldId);
  if (!category || !section || !field) return undefined;
  if (
    category.repeatable &&
    (candidate.rowIndex === undefined ||
      !Number.isSafeInteger(candidate.rowIndex) ||
      candidate.rowIndex < 0)
  )
    return undefined;
  return { category, section, field };
}

function displayValue(
  value: string | undefined,
  candidate: ImportCandidate,
): string {
  if (!value) return "없음";
  const option = destination(candidate)?.field.options?.find((option) =>
    typeof option === "string" ? option === value : option.value === value,
  );
  return option && typeof option !== "string" ? option.label : value;
}

const NAME_GROUPS = [
  {
    source: "basicInformation.name",
    title: "이름 확인",
    keys: [
      ["koreanFamilyName", "국문 성"],
      ["koreanGivenName", "국문 이름"],
    ],
  },
  {
    source: "basicInformation.englishName",
    title: "영문 이름 확인",
    keys: [
      ["englishFamilyName", "영문 성"],
      ["englishGivenName", "영문 이름"],
    ],
  },
] as const;
const isName = (candidate: ImportCandidate) =>
  NAME_GROUPS.some((group) => group.source === candidate.source);
const groupKey = (candidate: ImportCandidate) =>
  `${candidate.profileFieldKey?.split(".").slice(0, 2).join(".")}.${candidate.rowIndex}`;
const fieldLabel = (candidate: ImportCandidate) => {
  const dest = destination(candidate)!;
  const label =
    dest.field.id === "email"
      ? "이메일"
      : dest.field.id === "phoneNumber"
        ? "전화번호"
        : dest.field.label;
  return dest.category.repeatable
    ? `${dest.section.label} ${candidate.rowIndex! + 1} ${label}`
    : label;
};
function skippedReason(reason: string) {
  if (["no_profile_mapping", "unsupported_field"].includes(reason))
    return "대응하는 프로필 항목이 없어 제외";
  if (reason === "empty") return "비어 있어 제외";
  if (reason === "hidden_or_inert")
    return "숨겨져 있거나 비활성 영역에 있어 제외";
  if (reason === "unrecognized_document")
    return "Greeting 지원서 구조를 확인할 수 없어 제외";
  if (
    reason.includes("ambiguous") ||
    reason.includes("invalid_rows") ||
    reason.includes("unbound")
  )
    return "필드 또는 행의 연결이 모호하여 제외";
  if (reason.includes("invalid") || reason.includes("format"))
    return "값의 형식을 확인할 수 없어 제외";
  if (["read_error", "read_failed"].includes(reason))
    return "값을 읽는 중 오류가 발생하여 제외";
  return "현재 페이지에서 안전하게 읽을 수 없어 제외";
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
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const alive = useRef(false);
  const pending = useRef(false);

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
    void Promise.all([repository.load(), readCandidates()])
      .then(([profile, found]) => {
        if (!active) return;
        setBaseline(profile);
        setCandidates(found);
        setEdits(
          Object.fromEntries(
            found
              .filter((c) => c.value && c.precision === "day")
              .map((c) => [c.source, c.value!]),
          ),
        );
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
  const checkedCount = Object.values(selected).filter(Boolean).length;
  const toggle = (key: string, value: boolean) =>
    setSelected((current) => ({ ...current, [key]: value }));
  const selectAll = () => {
    const keys = fields.map((c) => c.source);
    for (const group of NAME_GROUPS)
      if (usable.some((c) => c.source === group.source))
        keys.push(...group.keys.map(([key]) => key));
    setSelected(Object.fromEntries(keys.map((key) => [key, true])));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current || !baseline || !checkedCount) return;
    const selection: ImportSelection = { single: {}, entries: [] };
    for (const group of NAME_GROUPS) {
      if (!usable.some((c) => c.source === group.source)) continue;
      for (const [key] of group.keys)
        if (selected[key])
          selection.single!.personal = {
            ...selection.single!.personal,
            [key]: edits[key]?.trim() ?? "",
          };
    }
    for (const candidate of fields) {
      if (!selected[candidate.source]) continue;
      const { category, section, field } = destination(candidate)!;
      const value =
        field.inputType === "date"
          ? (edits[candidate.source] ?? "")
          : candidate.value!;
      if (!category.repeatable) {
        const id = category.id as SingleProfileCategoryId;
        selection.single![id] = { ...selection.single![id], [field.id]: value };
        continue;
      }
      const key = groupKey(candidate);
      if (!targets[key]) {
        setError(
          `${section.label} ${candidate.rowIndex! + 1}의 저장 대상을 선택해 주세요.`,
        );
        return;
      }
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
          ...(targets[key] === "new"
            ? {}
            : { targetId: targets[key].slice("existing:".length) }),
          values: {},
        };
        selection.entries!.push(entry);
      }
      entry.values[field.id] = value;
    }
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
          "선택한 정보를 확인해 주세요. 새 항목에는 학교명·직장명·시험명 등의 대표 이름이 필요하며 날짜는 연·월·일 전체를 입력해야 합니다. 같은 항목은 기존 항목에 연결해 주세요.",
        );
      else if (failure instanceof ImportConflictError) {
        setError(
          "검토 중 프로필이 변경되었습니다. 최신 값을 확인하고 가져올 항목을 다시 선택해 주세요.",
        );
        setSelected({});
        setTargets({});
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

  const renderField = (candidate: ImportCandidate, current?: string) => {
    const { field } = destination(candidate)!;
    const label = fieldLabel(candidate);
    return (
      <div className={styles.field} key={candidate.source}>
        <label>
          <input
            type="checkbox"
            checked={Boolean(selected[candidate.source])}
            onChange={(e) => toggle(candidate.source, e.target.checked)}
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
              required={selected[candidate.source]}
              onChange={(e) =>
                setEdits({ ...edits, [candidate.source]: e.target.value })
              }
            />
          </label>
        )}
        {candidate.precision === "month" && (
          <small>
            일자가 없습니다. 정확한 날짜를 입력하거나 선택하지 마세요.
          </small>
        )}
        {candidate.reason === "catalog_unverified" && (
          <small>
            직접 입력한 이름으로 저장됩니다. 검색 선택은 프로필 관리에서 할 수
            있습니다.
          </small>
        )}
        <small>기존 값: {displayValue(current, candidate)}</small>
      </div>
    );
  };

  return (
    <section
      className={styles.importer}
      aria-label="지원서에서 프로필 가져오기"
    >
      <style>{css}</style>
      <h2>지원서에서 가져오기</h2>
      <p>
        현재 Greeting 지원서에서 프로필에 저장할 수 있는 정보를 가져옵니다.
        저장할 항목을 선택해 주세요.
      </p>
      <p className={styles.hint}>
        현재 화면에서 읽을 수 있는 항목만 표시합니다. 지원서의 저장·제출은
        실행하지 않습니다.
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
            <legend>가져올 정보 선택</legend>
            <div className={styles.actions}>
              <button type="button" onClick={selectAll}>
                전체 선택
              </button>
              <button type="button" onClick={() => setSelected({})}>
                선택 해제
              </button>
            </div>
            <p className={styles.hint}>
              전체 선택에는 민감 항목도 포함됩니다. 이름·날짜 확인과 반복 항목의
              저장 대상을 지정한 뒤 저장해 주세요.
            </p>
            {NAME_GROUPS.map((group) => {
              const name = usable.find((c) => c.source === group.source);
              return (
                name && (
                  <fieldset className={styles.group} key={group.source}>
                    <legend>{group.title}</legend>
                    <p>지원서 이름: {name.value}</p>
                    <p className={styles.hint}>
                      성과 이름을 직접 확인해 입력해 주세요.
                    </p>
                    {group.keys.map(([key, label]) => (
                      <div className={styles.field} key={key}>
                        <label>
                          <input
                            type="checkbox"
                            checked={Boolean(selected[key])}
                            onChange={(e) => toggle(key, e.target.checked)}
                          />
                          {label} 가져오기
                        </label>
                        <label>
                          {label}
                          <input
                            type="text"
                            value={edits[key] ?? ""}
                            required={selected[key]}
                            onChange={(e) =>
                              setEdits({ ...edits, [key]: e.target.value })
                            }
                          />
                        </label>
                        <small>
                          기존 값: {baseline.personal[key] || "없음"}
                        </small>
                      </div>
                    ))}
                  </fieldset>
                )
              );
            })}
            {PROFILE_CATEGORIES.filter((category) => !category.repeatable).map(
              (category) => {
                const categoryFields = fields.filter(
                  (c) => destination(c)!.category.id === category.id,
                );
                return (
                  categoryFields.length > 0 && (
                    <fieldset className={styles.group} key={category.id}>
                      <legend>
                        {category.label}
                        {category.sensitive ? " · 민감 정보" : ""}
                      </legend>
                      {categoryFields.map((c) =>
                        renderField(
                          c,
                          baseline[category.id as SingleProfileCategoryId][
                            destination(c)!.field.id
                          ],
                        ),
                      )}
                    </fieldset>
                  )
                );
              },
            )}
            {groups.map((key) => {
              const rowFields = fields.filter((c) => groupKey(c) === key);
              const { category, section } = destination(rowFields[0])!;
              const title = `${section.label} ${rowFields[0].rowIndex! + 1}`;
              const entries = baseline[
                category.id as RepeatedProfileCategoryId
              ].filter((entry) => entry.sectionId === section.id);
              const target = entries.find(
                (entry) => `existing:${entry.id}` === targets[key],
              );
              return (
                <fieldset className={styles.group} key={key}>
                  <legend>{title}</legend>
                  <label>
                    {title} 저장 대상
                    <select
                      value={targets[key] ?? ""}
                      onChange={(e) =>
                        setTargets({ ...targets, [key]: e.target.value })
                      }
                    >
                      <option value="">추가 또는 연결 선택</option>
                      <option value="new">새 {section.label}로 추가</option>
                      {entries.map((entry, i) => (
                        <option key={entry.id} value={`existing:${entry.id}`}>
                          기존 {i + 1}:{" "}
                          {entry.values.schoolName ||
                            entry.values.companyName ||
                            entry.values.testName ||
                            entry.values.name ||
                            entry.values.language ||
                            entry.values.projectName ||
                            entry.values.title ||
                            "이름 없음"}{" "}
                          {entry.values.startDate || ""} ~{" "}
                          {entry.values.endDate || ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  {rowFields.map((c) =>
                    renderField(c, target?.values[destination(c)!.field.id]),
                  )}
                </fieldset>
              );
            })}
            <p className={styles.hint}>
              선택한 항목만 저장합니다. 기존 값이 있으면 위에 표시한 가져올
              값으로 바뀝니다.
            </p>
            <button type="submit" disabled={!checkedCount}>
              {saving ? "저장 중…" : "선택한 정보 저장"}
            </button>
          </fieldset>
        </form>
      )}
      {!loading && skipped.length > 0 && (
        <div className={styles.hint} aria-label="제외한 항목">
          <p>{skipped.length}개 항목 제외</p>
          <ul>
            {[...skippedCounts].map(([reason, count]) => (
              <li key={reason}>
                {reason}: {count}개
              </li>
            ))}
          </ul>
        </div>
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
