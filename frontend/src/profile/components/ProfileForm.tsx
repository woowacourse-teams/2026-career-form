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
  return [...(field.optionsFor?.(values) ?? field.options ?? [])].map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );
}

function fieldValue(field: ProfileFieldDefinition, value: string): string {
  return field.inputType === "tel" ? value.replace(/\D/g, "").slice(0, 11) : value;
}

function Fields({ section, values, idPrefix, onChange }: FieldsProps) {
  return (
    <div className={styles.fieldGrid}>
      {section.fields.filter((field) => !field.visibleWhen || field.visibleWhen(values)).map((field) => {
        const id = `${idPrefix}-${field.id}`;
        const options = optionsForField(field, values);
        const value = values[field.id] ?? "";
        const hasLegacyValue = value.length > 0 && !options.some((option) => option.value === value);
        return (
          <label className={styles.field} htmlFor={id} key={field.id}>
            <span>{field.label}</span>
            {field.inputType === "textarea" ? (
              <textarea
                id={id}
                value={values[field.id] ?? ""}
                onChange={(event) => onChange(field.id, event.target.value)}
                rows={4}
              />
            ) : field.inputType === "select" ? (
              <select
                id={id}
                value={value}
                onChange={(event) => onChange(field.id, event.target.value)}
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
              <input
                id={id}
                type={field.inputType}
                value={values[field.id] ?? ""}
                inputMode={field.inputType === "tel" ? "numeric" : undefined}
                maxLength={field.inputType === "tel" ? 11 : undefined}
                onChange={(event) => onChange(field.id, fieldValue(field, event.target.value))}
              />
            )}
          </label>
        );
      })}
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

export function ProfileForm({
  category,
  profile,
  onAddEntry,
  onRemoveEntry,
  onUpdateEntry,
  onUpdateSingle,
  confirmDelete,
}: ProfileFormProps) {
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
  const topLevelEntry = entries.find((entry) => entry.sectionId === "university") ?? entries[0];
  return (
    <div className={styles.repeatedSection}>
      {category.topLevelFields && topLevelEntry && (
        <Fields
          section={{ id: "top-level", label: category.label, fields: category.topLevelFields }}
          values={topLevelEntry.values}
          idPrefix={`${category.id}-top-level`}
          onChange={(fieldId, value) => onUpdateEntry(categoryId, topLevelEntry.id, fieldId, value)}
        />
      )}
      <div className={styles.addActions}>
        {category.sections.map((section) => (
          <button
            className={styles.secondaryButton}
            key={section.id}
            type="button"
            onClick={() => onAddEntry(categoryId, section.id)}
          >
            {section.label} 추가
          </button>
        ))}
      </div>
      {entries.length === 0 && (
        <p className={styles.empty}>
          등록된 항목이 없습니다. 필요한 항목만 추가하세요.
        </p>
      )}
      {entries.map((entry, index) => {
        const section = findSection(category, entry);
        const title = `${section.label} ${index + 1}`;
        return (
          <article className={styles.card} key={entry.id}>
            <div className={styles.cardHeader}>
              <h3>{title}</h3>
              <button
                className={styles.deleteButton}
                type="button"
                aria-label={`${title} 삭제`}
                onClick={() => {
                  if (confirmDelete(`${title}을(를) 삭제할까요?`)) {
                    onRemoveEntry(categoryId, entry.id);
                  }
                }}
              >
                삭제
              </button>
            </div>
            <Fields
              section={section}
              values={entry.values}
              idPrefix={`${category.id}-${entry.id}`}
              onChange={(fieldId, value) =>
                onUpdateEntry(categoryId, entry.id, fieldId, value)
              }
            />
          </article>
        );
      })}
    </div>
  );
}
