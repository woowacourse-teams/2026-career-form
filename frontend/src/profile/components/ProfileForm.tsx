import { useEffect, useRef, useState } from "react";
import type {
  Profile,
  ProfileEntry,
  RepeatedProfileCategoryId,
  SingleProfileCategoryId,
} from "../model";
import type {
  ProfileCategoryDefinition,
  ProfileFieldDefinition,
  ProfileSectionDefinition,
} from "../field-definitions";
import styles from "./ProfileForm.module.css";
import {
  editorFieldGroups,
  entrySummary,
  FIELD_EXAMPLES,
  FULL_WIDTH_FIELDS,
} from "../editor-presentation";

interface ProfileFormProps {
  category: ProfileCategoryDefinition;
  profile: Profile;
  onAddEntry(categoryId: RepeatedProfileCategoryId, sectionId: string): void;
  onRemoveEntry(categoryId: RepeatedProfileCategoryId, entryId: string): void;
  onUpdateEntry(
    categoryId: RepeatedProfileCategoryId,
    entryId: string,
    fieldId: string,
    value: string,
  ): void;
  onUpdateSingle(
    categoryId: SingleProfileCategoryId,
    fieldId: string,
    value: string,
  ): void;
  confirmDelete(message: string): boolean;
}

interface FieldsProps {
  section: ProfileSectionDefinition;
  values: Record<string, string>;
  idPrefix: string;
  onChange(fieldId: string, value: string): void;
}

function optionsForField(
  field: ProfileFieldDefinition,
  values: Record<string, string>,
): Array<{ value: string; label: string }> {
  return [...(field.optionsFor?.(values) ?? field.options ?? [])].map(
    (option) =>
      typeof option === "string" ? { value: option, label: option } : option,
  );
}

function fieldValue(field: ProfileFieldDefinition, value: string): string {
  return field.inputType === "tel"
    ? value.replace(/\D/g, "").slice(0, 11)
    : value;
}

function Fields({ section, values, idPrefix, onChange }: FieldsProps) {
  return (
    <div className={styles.fieldGroups}>
      {editorFieldGroups(section).map((group) => (
        <fieldset className={styles.fieldGroup} key={group.title}>
          {group.title && <legend>{group.title}</legend>}
          <div className={styles.fieldGrid}>
            {group.fields
              .filter(
                (field) => !field.visibleWhen || field.visibleWhen(values),
              )
              .map((field) => {
                const id = `${idPrefix}-${field.id}`;
                const options = optionsForField(field, values);
                const value = values[field.id] ?? "";
                const hasLegacyValue =
                  value.length > 0 &&
                  !options.some((option) => option.value === value);
                return (
                  <label
                    className={`${styles.field} ${field.inputType === "textarea" || FULL_WIDTH_FIELDS.has(field.id) ? styles.fullWidth : ""}`}
                    htmlFor={id}
                    key={field.id}
                  >
                    <span className={styles.fieldLabel}>
                      <span>{field.label}</span>
                    </span>
                    {field.inputType === "textarea" ? (
                      <textarea
                        id={id}
                        aria-label={field.label}
                        value={values[field.id] ?? ""}
                        onChange={(event) =>
                          onChange(field.id, event.target.value)
                        }
                        rows={5}
                      />
                    ) : field.inputType === "select" ? (
                      <select
                        id={id}
                        aria-label={field.label}
                        value={value}
                        onChange={(event) =>
                          onChange(field.id, event.target.value)
                        }
                      >
                        <option value="">선택하세요</option>
                        {hasLegacyValue && (
                          <option value={value}>{`기존 값: ${value}`}</option>
                        )}
                        {options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <input
                          id={id}
                          aria-label={field.label}
                          type={field.inputType}
                          value={values[field.id] ?? ""}
                          placeholder={
                            field.placeholder ??
                            (field.id === "grade" &&
                            section.id !== "languageTest"
                              ? "등급이 있다면 입력"
                              : FIELD_EXAMPLES[field.id])
                          }
                          inputMode={
                            field.inputType === "tel" ? "numeric" : undefined
                          }
                          onChange={(event) =>
                            onChange(
                              field.id,
                              fieldValue(field, event.target.value),
                            )
                          }
                        />
                      </>
                    )}
                  </label>
                );
              })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function findSection(
  category: ProfileCategoryDefinition,
  entry: ProfileEntry,
): ProfileSectionDefinition {
  return (
    category.sections.find((section) => section.id === entry.sectionId) ??
    category.sections[0]
  );
}

function EntryCard({
  categoryId,
  title,
  entry,
  section,
  onChange,
  onDelete,
}: {
  categoryId: RepeatedProfileCategoryId;
  title: string;
  entry: ProfileEntry;
  section: ProfileSectionDefinition;
  onChange(fieldId: string, value: string): void;
  onDelete(): void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const bodyId = `${categoryId}-entry-body-${entry.id}`;
  return (
    <article className={styles.card} data-entry-id={entry.id}>
      <div className={styles.cardHeader}>
        <button
          type="button"
          className={styles.cardToggle}
          aria-label={`${title} ${collapsed ? "펼치기" : "접기"}`}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onClick={() => setCollapsed((value) => !value)}
        >
          <span className={styles.cardChevron} aria-hidden="true">
            {collapsed ? "+" : "−"}
          </span>
          <span className={styles.cardIdentity}>
            <span className={styles.cardTitle} role="heading" aria-level={3}>
              {title}
            </span>
            <span className={styles.cardSummary}>{entrySummary(entry)}</span>
          </span>
        </button>
        <button
          type="button"
          className={styles.deleteButton}
          aria-label={`${title} 삭제`}
          onClick={onDelete}
        >
          삭제
        </button>
      </div>
      <div id={bodyId} className={styles.cardBody} hidden={collapsed}>
        <Fields
          section={section}
          values={entry.values}
          idPrefix={`${categoryId}-entry-${entry.id}`}
          onChange={onChange}
        />
      </div>
    </article>
  );
}

export function ProfileForm({
  category,
  profile,
  onAddEntry,
  onRemoveEntry,
  onUpdateEntry,
  onUpdateSingle,
  confirmDelete,
}: ProfileFormProps) {
  const formRef = useRef<HTMLDivElement>(null);
  const pendingAdd = useRef(false);
  useEffect(() => {
    if (!pendingAdd.current) return;
    const entries = profile[category.id];
    if (!Array.isArray(entries) || !entries.length) return;
    const lastEntry = entries[entries.length - 1];
    const card = Array.from(
      formRef.current?.querySelectorAll<HTMLElement>("[data-entry-id]") ?? [],
    ).find((element) => element.dataset.entryId === lastEntry.id);
    card?.querySelector<HTMLInputElement>("input, select, textarea")?.focus();
    pendingAdd.current = false;
  }, [profile, category.id]);

  if (!category.repeatable) {
    const categoryId = category.id as SingleProfileCategoryId;
    return (
      <Fields
        section={category.sections[0]}
        values={profile[categoryId]}
        idPrefix={category.id}
        onChange={(fieldId, value) =>
          onUpdateSingle(categoryId, fieldId, value)
        }
      />
    );
  }

  const categoryId = category.id as RepeatedProfileCategoryId;
  const entries = profile[categoryId];
  const topLevelEntry =
    entries.find((entry) => entry.sectionId === "university") ?? entries[0];
  return (
    <div className={styles.repeatedSection} ref={formRef}>
      {category.topLevelFields && topLevelEntry && (
        <Fields
          section={{
            id: "top-level",
            label: category.label,
            fields: category.topLevelFields,
          }}
          values={topLevelEntry.values}
          idPrefix={`${category.id}-top-level`}
          onChange={(fieldId, value) =>
            onUpdateEntry(categoryId, topLevelEntry.id, fieldId, value)
          }
        />
      )}
      <div className={styles.addActions}>
        {category.sections.map((section) => (
          <button
            className={styles.secondaryButton}
            key={section.id}
            type="button"
            onClick={() => {
              pendingAdd.current = true;
              onAddEntry(categoryId, section.id);
            }}
          >
            <span aria-hidden="true">＋</span> {section.label} 추가
          </button>
        ))}
      </div>
      {entries.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">
            ＋
          </span>
          <strong>첫 {category.label} 정보를 추가해 보세요</strong>
          <p>
            위의 추가 버튼을 눌러 시작하세요.
            <br />
            해당하는 정보만 기록해도 괜찮아요.
          </p>
        </div>
      )}
      {entries.map((entry, index) => {
        const section = findSection(category, entry);
        const title = `${section.label} ${index + 1}`;
        return (
          <EntryCard
            categoryId={categoryId}
            key={entry.id}
            title={title}
            entry={entry}
            section={section}
            onChange={(fieldId, value) =>
              onUpdateEntry(categoryId, entry.id, fieldId, value)
            }
            onDelete={() => {
              if (confirmDelete(`${title}을(를) 삭제할까요?`))
                onRemoveEntry(categoryId, entry.id);
            }}
          />
        );
      })}
    </div>
  );
}
