import { useCallback, useEffect, useRef, useState } from "react";

import {
  createEmptyProfile,
  type Profile,
  type RepeatedProfileCategoryId,
  type SingleProfileCategoryId,
} from "../model";
import type { ProfileRepository } from "../profile-repository";

export type SaveStatus = "idle" | "saving" | "saved" | "error";
export type LoadStatus = "loading" | "ready" | "error";

function createEntryId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `entry-${Date.now()}`;
}

export function useProfileEditor(
  repository: ProfileRepository,
  saveDelay = 500,
) {
  const [profile, setProfile] = useState<Profile>(createEmptyProfile);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const latestProfile = useRef(profile);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveRequestId = useRef(0);

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
  }, [repository]);

  const persist = useCallback(
    async (nextProfile: Profile) => {
      const requestId = ++saveRequestId.current;
      const operation = saveQueue.current
        .catch(() => undefined)
        .then(() => repository.save(nextProfile));
      saveQueue.current = operation;
      try {
        await operation;
        if (requestId === saveRequestId.current) setSaveStatus("saved");
      } catch {
        if (requestId === saveRequestId.current) setSaveStatus("error");
      }
    },
    [repository],
  );

  const changeProfile = useCallback(
    (updater: (current: Profile) => Profile) => {
      setProfile((current) => {
        const next = updater(current);
        latestProfile.current = next;
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
      changeProfile((current) => ({
        ...current,
        [categoryId]: { ...current[categoryId], [fieldId]: value },
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
    ) => {
      changeProfile((current) => ({
        ...current,
        [categoryId]: current[categoryId].map((entry) =>
          entry.id === entryId
            ? { ...entry, values: { ...entry.values, [fieldId]: value } }
            : entry,
        ),
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
    setSaveStatus("saving");
    await persist(latestProfile.current);
  }, [persist]);

  return {
    profile,
    loadStatus,
    saveStatus,
    updateSingle,
    addEntry,
    updateEntry,
    removeEntry,
    retrySave,
  };
}
