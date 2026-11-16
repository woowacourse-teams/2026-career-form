import { useCallback, useEffect, useRef, useState } from "react";

import {
  contactWithSelectedAddress,
  withoutStaleAddressVerification,
  type StructuredAddress,
} from "../address";
import { catalogCertificateIssuer } from "../catalog";
import {
  createEmptyProfile,
  type Profile,
  type ProfileEntry,
  type ProfileIdentity,
  type RepeatedProfileCategoryId,
  type SingleProfileCategoryId,
} from "../model";
import {
  cloneProfile,
  ProfileWriteConflictError,
  type ProfileRepository,
} from "../profile-repository";

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";
export type LoadStatus = "loading" | "ready" | "error";

function createEntryId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `entry-${Date.now()}`;
}

function isIdentityField(
  categoryId: RepeatedProfileCategoryId,
  entry: ProfileEntry,
  fieldId: string,
): boolean {
  return (
    (categoryId === "certifications" && fieldId === "name") ||
    (categoryId === "languages" &&
      entry.sectionId === "languageTest" &&
      fieldId === "testName") ||
    (categoryId === "education" && fieldId === "schoolName")
  );
}

/**
 * Issuer text that a catalog selection filled into a certificate entry object.
 * React StrictMode calls state updaters twice, so a note is written only on
 * the entry object an updater has just created, never on one it read. Profile
 * state is never changed in place, so a lookup gives the same answer on every
 * call. Updaters must hand back unchanged entries as the same objects; a copy
 * loses its note. Load, import and reload create new objects without notes,
 * so their issuers never count as filled. Nothing here is saved.
 */
const filledIssuers = new WeakMap<ProfileEntry, string>();

/**
 * Issuer to write for a certificate edit, and the filled issuer the edited
 * entry keeps. A catalog selection fills a blank issuer or replaces one that
 * still holds exactly the text an earlier selection filled; a selection that
 * keeps the user's issuer forgets the earlier fill. Other edits keep the note.
 */
function certificateIssuerEdit(
  categoryId: RepeatedProfileCategoryId,
  fieldId: string,
  entry: ProfileEntry,
  name: string,
  identity: ProfileIdentity | undefined,
): { issuer?: string; filled?: string } {
  if (categoryId !== "certifications") return {};
  const filled = filledIssuers.get(entry);
  const selected =
    fieldId === "name" ? catalogCertificateIssuer(identity, name) : undefined;
  if (!selected) return { filled };
  const current = entry.values.issuer ?? "";
  return !current.trim() || current === filled
    ? { issuer: selected, filled: selected }
    : {};
}

export function useProfileEditor(
  repository: ProfileRepository,
  saveDelay = 500,
) {
  const [profile, setProfile] = useState<Profile>(createEmptyProfile);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const latestProfile = useRef(profile);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveRequestId = useRef(0);
  const conflicted = useRef(false);
  const reloading = useRef(false);
  const [isReloading, setIsReloading] = useState(false);
  const [reloadFailed, setReloadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    repository
      .load()
      .then((loaded) => {
        if (!active) return;
        latestProfile.current = loaded;
        setProfile(loaded);
        setLoadStatus("ready");
      })
      .catch(() => {
        if (active) setLoadStatus("error");
      });
    return () => {
      active = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [repository, loadAttempt]);

  const retryLoad = useCallback(() => {
    if (loadStatus !== "error") return;
    setLoadStatus("loading");
    setLoadAttempt((attempt) => attempt + 1);
  }, [loadStatus]);

  const persist = useCallback(
    async (nextProfile: Profile) => {
      if (conflicted.current || reloading.current) return false;
      const requestId = ++saveRequestId.current;
      const operation = saveQueue.current
        .catch(() => undefined)
        .then(async () => {
          if (conflicted.current || reloading.current) return false;
          try {
            await repository.save(nextProfile);
            return true;
          } catch (error) {
            if (error instanceof ProfileWriteConflictError) {
              conflicted.current = true;
              if (saveTimer.current) clearTimeout(saveTimer.current);
            }
            throw error;
          }
        });
      saveQueue.current = operation.then(
        () => undefined,
        () => undefined,
      );
      try {
        const saved = await operation;
        if (!saved) return false;
        if (requestId === saveRequestId.current) setSaveStatus("saved");
        return true;
      } catch {
        if (requestId === saveRequestId.current || conflicted.current)
          setSaveStatus(conflicted.current ? "conflict" : "error");
        return false;
      }
    },
    [repository],
  );

  const changeProfile = useCallback(
    (updater: (current: Profile) => Profile) => {
      if (reloading.current) return;
      setProfile((current) => {
        const next = updater(current);
        latestProfile.current = next;
        if (conflicted.current) return next;
        setSaveStatus("saving");
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => void persist(next), saveDelay);
        return next;
      });
    },
    [persist, saveDelay],
  );

  const updateSingle = useCallback(
    (categoryId: SingleProfileCategoryId, fieldId: string, value: string) => {
      changeProfile((current) => {
        const values = { ...current[categoryId], [fieldId]: value };
        return {
          ...current,
          [categoryId]:
            categoryId === "contact"
              ? withoutStaleAddressVerification(current.contact, values)
              : values,
        };
      });
    },
    [changeProfile],
  );

  const selectAddress = useCallback(
    (address: StructuredAddress) => {
      changeProfile((current) => ({
        ...current,
        contact: contactWithSelectedAddress(current.contact, address),
      }));
    },
    [changeProfile],
  );

  const addEntry = useCallback(
    (categoryId: RepeatedProfileCategoryId, sectionId: string) => {
      changeProfile((current) => ({
        ...current,
        [categoryId]: [
          ...current[categoryId],
          { id: createEntryId(), sectionId, values: {} },
        ],
      }));
    },
    [changeProfile],
  );

  const updateEntry = useCallback(
    (
      categoryId: RepeatedProfileCategoryId,
      entryId: string,
      fieldId: string,
      value: string,
      identity?: ProfileIdentity,
    ) => {
      changeProfile((current) => ({
        ...current,
        [categoryId]: current[categoryId].map((entry) => {
          if (entry.id !== entryId) return entry;
          const { issuer, filled } = certificateIssuerEdit(
            categoryId,
            fieldId,
            entry,
            value,
            identity,
          );
          const next: ProfileEntry = {
            ...entry,
            values: {
              ...entry.values,
              [fieldId]: value,
              ...(issuer ? { issuer } : {}),
            },
            ...(isIdentityField(categoryId, entry, fieldId)
              ? {
                  identity: identity ?? {
                    status: "manual" as const,
                    originalText: value,
                  },
                }
              : {}),
          };
          // Only the object made here gets the note, so another call with the
          // same state still reads the same notes.
          if (filled) filledIssuers.set(next, filled);
          return next;
        }),
      }));
    },
    [changeProfile],
  );

  const removeEntry = useCallback(
    (categoryId: RepeatedProfileCategoryId, entryId: string) => {
      changeProfile((current) => ({
        ...current,
        [categoryId]: current[categoryId].filter(
          (entry) => entry.id !== entryId,
        ),
      }));
    },
    [changeProfile],
  );

  const retrySave = useCallback(async () => {
    if (conflicted.current || reloading.current) return;
    setSaveStatus("saving");
    await persist(latestProfile.current);
  }, [persist]);

  const replaceProfile = useCallback(
    async (nextProfile: Profile) => {
      if (conflicted.current || reloading.current) return false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const replacement = cloneProfile(nextProfile);
      latestProfile.current = replacement;
      setProfile(replacement);
      setSaveStatus("saving");
      return persist(replacement);
    },
    [persist],
  );

  const reloadLatest = useCallback(async () => {
    if (reloading.current) return false;
    reloading.current = true;
    setIsReloading(true);
    setReloadFailed(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    ++saveRequestId.current;
    try {
      await saveQueue.current.catch(() => undefined);
      const loaded = await repository.load();
      latestProfile.current = loaded;
      setProfile(loaded);
      conflicted.current = false;
      setSaveStatus("idle");
      return true;
    } catch {
      setReloadFailed(true);
      return false;
    } finally {
      reloading.current = false;
      setIsReloading(false);
    }
  }, [repository]);

  return {
    profile,
    loadStatus,
    retryLoad,
    saveStatus,
    updateSingle,
    selectAddress,
    addEntry,
    updateEntry,
    removeEntry,
    retrySave,
    replaceProfile,
    reloadLatest,
    isReloading,
    reloadFailed,
  };
}
