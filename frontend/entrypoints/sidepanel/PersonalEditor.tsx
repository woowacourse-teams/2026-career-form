import { useEffect, useRef, useState } from "react";
import { PROFILE_CATEGORIES } from "../../src/profile/field-definitions";
import type { Profile } from "../../src/profile/model";
import {
  sanitizeProfile,
  type ProfileRepository,
} from "../../src/profile/profile-repository";
import styles from "./App.module.css";

const fields = PROFILE_CATEGORIES.find(
  (category) => category.id === "personal",
)!.sections.flatMap((section) => section.fields);

export function PersonalEditor({
  profile,
  repository,
  onSaved,
  onCancel,
  fieldId,
}: {
  profile: Profile;
  repository: ProfileRepository;
  onSaved(profile: Profile): void;
  onCancel(): void;
  fieldId: string;
}) {
  const [draft, setDraft] = useState(() => ({ ...profile.personal }));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);
  async function save() {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setFailed(false);
    try {
      const latest = await repository.load();
      const changed = Object.fromEntries(
        fields
          .filter((field) => field.id === fieldId)
          .filter(
            ({ id }) => (draft[id] ?? "") !== (profile.personal[id] ?? ""),
          )
          .map(({ id }) => [id, draft[id] ?? ""]),
      );
      const next = sanitizeProfile({
        ...latest,
        personal: { ...latest.personal, ...changed },
      });
      await repository.save(next);
      onSaved(next);
    } catch {
      setFailed(true);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return (
    <form
      className={styles.personalEditor}
      aria-label="기본 인적사항 수정"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        if (!saving) onCancel();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <fieldset disabled={saving}>
        <legend className={styles.visuallyHidden}>기본 인적사항</legend>
        <div className={styles.editorFields}>
          {fields
            .filter((field) => field.id === fieldId)
            .map((field) => (
              <label key={field.id}>
                <span className={styles.visuallyHidden}>{field.label}</span>
                <input
                  ref={input}
                  type={field.inputType === "date" ? "date" : "text"}
                  value={draft[field.id] ?? ""}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      [field.id]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
        </div>
        <div className={styles.editorActions}>
          <button type="button" onClick={onCancel}>
            취소
          </button>
          <button type="submit">{saving ? "저장 중…" : "저장"}</button>
        </div>
        {failed && (
          <p role="alert" className={styles.copyError}>
            저장하지 못했습니다. 입력 내용은 유지되니 다시 시도해 주세요.
          </p>
        )}
      </fieldset>
    </form>
  );
}
