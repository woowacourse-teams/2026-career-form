import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Profile } from "../model";
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
type EducationField = "schoolName" | "startDate" | "endDate";
const EDUCATION_LABELS: Record<EducationField, string> = {
  schoolName: "학교명",
  startDate: "입학일",
  endDate: "졸업일",
};
const educationFields = Object.keys(EDUCATION_LABELS) as EducationField[];

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
  const [targets, setTargets] = useState<Record<number, string>>({});
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
    (c) => c.status !== "unsupported" && c.value,
  );
  const name = usable.find((c) => c.source === "basicInformation.name");
  const rows = [
    ...new Set(
      usable.flatMap((c) => (c.rowIndex === undefined ? [] : [c.rowIndex])),
    ),
  ].sort((a, b) => a - b);
  const checkedCount = Object.values(selected).filter(Boolean).length;
  const toggle = (key: string, value: boolean) =>
    setSelected((current) => ({ ...current, [key]: value }));
  const educationCandidate = (row: number, field: EducationField) =>
    usable.find(
      (c) =>
        c.rowIndex === row &&
        c.profileFieldKey === `education.university.${field}`,
    );

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current || !baseline || !checkedCount) return;
    const selection: ImportSelection = { education: [] };
    for (const key of ["koreanFamilyName", "koreanGivenName"] as const) {
      if (selected[key])
        selection.personal = {
          ...selection.personal,
          [key]: edits[key]?.trim() ?? "",
        };
    }
    for (const key of ["email", "phoneNumber"] as const) {
      const candidate = usable.find(
        (c) => c.profileFieldKey === `contact.contact.${key}`,
      );
      if (candidate && selected[candidate.source])
        selection.contact = { ...selection.contact, [key]: candidate.value! };
    }
    for (const row of rows) {
      const values: Partial<Record<EducationField, string>> = {};
      for (const field of educationFields) {
        const c = educationCandidate(row, field);
        if (c && selected[c.source])
          values[field] =
            field === "schoolName" ? c.value! : (edits[c.source] ?? "");
      }
      if (!Object.keys(values).length) continue;
      if (!targets[row]) {
        setError(`대학교 ${row + 1}의 저장 대상을 선택해 주세요.`);
        return;
      }
      selection.education.push({
        sourceRow: row,
        ...(targets[row] === "new"
          ? {}
          : { targetId: targets[row].slice("existing:".length) }),
        values,
      });
    }
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const saved = await saveImportSelection(repository, baseline, selection);
      if (alive.current) onSaved(saved);
    } catch (failure) {
      if (!alive.current) return;
      if (failure instanceof ImportSelectionError) {
        setError(
          "선택한 정보를 확인해 주세요. 새 학력에는 학교명이 필요하며 날짜는 연·월·일 전체를 입력해야 합니다. 같은 학력은 기존 항목에 연결해 주세요.",
        );
      } else if (failure instanceof ImportConflictError) {
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
      } else {
        setError("프로필을 저장하지 못했습니다. 다시 시도해 주세요.");
      }
    } finally {
      pending.current = false;
      if (alive.current) setSaving(false);
    }
  };

  return (
    <section
      className={styles.importer}
      aria-label="지원서에서 프로필 가져오기"
    >
      <style>{css}</style>
      <h2>지원서에서 가져오기</h2>
      <p>
        현재 Greeting 지원서의 기본정보와 대학교 정보를 가져옵니다. 저장할
        항목을 선택해 주세요.
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
            {name && (
              <fieldset className={styles.group}>
                <legend>이름 확인</legend>
                <p>지원서 이름: {name.value}</p>
                <p className={styles.hint}>
                  성과 이름을 직접 확인해 입력해 주세요.
                </p>
                {(
                  [
                    ["koreanFamilyName", "국문 성"],
                    ["koreanGivenName", "국문 이름"],
                  ] as const
                ).map(([key, label]) => (
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
                    <small>기존 값: {baseline.personal[key] || "없음"}</small>
                  </div>
                ))}
              </fieldset>
            )}
            {(
              [
                ["email", "이메일"],
                ["phoneNumber", "전화번호"],
              ] as const
            ).map(([key, label]) => {
              const c = usable.find(
                (candidate) =>
                  candidate.profileFieldKey === `contact.contact.${key}`,
              );
              return (
                c && (
                  <div key={key} className={styles.field}>
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(selected[c.source])}
                        onChange={(e) => toggle(c.source, e.target.checked)}
                      />
                      {label} 가져오기
                    </label>
                    <span>가져올 값: {c.value}</span>
                    <small>기존 값: {baseline.contact[key] || "없음"}</small>
                  </div>
                )
              );
            })}
            {rows.map((row) => {
              const target = baseline.education.find(
                (entry) => `existing:${entry.id}` === targets[row],
              );
              return (
                <fieldset className={styles.group} key={row}>
                  <legend>대학교 {row + 1}</legend>
                  <label>
                    대학교 {row + 1} 저장 대상
                    <select
                      value={targets[row] ?? ""}
                      onChange={(e) =>
                        setTargets({ ...targets, [row]: e.target.value })
                      }
                    >
                      <option value="">추가 또는 연결 선택</option>
                      <option value="new">새 대학교로 추가</option>
                      {baseline.education
                        .filter((entry) => entry.sectionId === "university")
                        .map((entry, i) => (
                          <option key={entry.id} value={`existing:${entry.id}`}>
                            기존 {i + 1}:{" "}
                            {entry.values.schoolName || "학교명 없음"}{" "}
                            {entry.values.startDate || ""} ~{" "}
                            {entry.values.endDate || ""}
                          </option>
                        ))}
                    </select>
                  </label>
                  {educationFields.map((field) => {
                    const c = educationCandidate(row, field);
                    if (!c) return null;
                    const label = `대학교 ${row + 1} ${EDUCATION_LABELS[field]}`;
                    return (
                      <div className={styles.field} key={field}>
                        <label>
                          <input
                            type="checkbox"
                            checked={Boolean(selected[c.source])}
                            onChange={(e) => toggle(c.source, e.target.checked)}
                          />
                          {label} 가져오기
                        </label>
                        <span>지원서 값: {c.value}</span>
                        {field !== "schoolName" && (
                          <label>
                            {label} 확인
                            <input
                              type="date"
                              value={edits[c.source] ?? ""}
                              required={selected[c.source]}
                              onChange={(e) =>
                                setEdits({
                                  ...edits,
                                  [c.source]: e.target.value,
                                })
                              }
                            />
                          </label>
                        )}
                        {c.precision === "month" && (
                          <small>
                            일자가 없습니다. 정확한 날짜를 입력하거나 선택하지
                            마세요.
                          </small>
                        )}
                        {field === "schoolName" && (
                          <small>
                            직접 입력한 학교명으로 저장됩니다. 학교 검색 선택은
                            프로필 관리에서 할 수 있습니다.
                          </small>
                        )}
                        <small>
                          기존 값: {target?.values[field] || "없음"}
                        </small>
                      </div>
                    );
                  })}
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
      {!loading && candidates.some((c) => c.status === "unsupported") && (
        <p className={styles.hint}>
          비어 있거나 숨겨진 항목, 구조를 확인할 수 없는 항목은 가져오기에서
          제외했습니다.
        </p>
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
