import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createEmptyProfile, type Profile } from "../model";
import type { ProfileRepository } from "../profile-repository";
import { PageImport } from "./PageImport";
import styles from "./PageImport.module.css";
import type { ImportCandidate } from "./reader";

const school: ImportCandidate = {
  source: "educationalBackground.universities.0.schoolName",
  rowIndex: 0,
  profileFieldKey: "education.university.schoolName",
  status: "review",
  reason: "catalog_unverified",
  value: "예시대학교",
};
const unsupported = (source: string, reason: string): ImportCandidate => ({
  source,
  status: "unsupported",
  reason,
});
const readSchool = async () => [school] as const;

function deferred<T>() {
  const resolve = vi.fn<(value: T) => void>();
  const reject = vi.fn<(reason: Error) => void>();
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve.mockImplementation(onResolve);
    reject.mockImplementation(onReject);
  });
  return { promise, resolve, reject };
}

function repositoryWith(load: ProfileRepository["load"]): ProfileRepository {
  return {
    load: vi.fn(load),
    save: vi.fn(async () => {}),
    loadLayout: async () => "a",
    saveLayout: async () => {},
  };
}

/** Load 1 mounts, load 2 is the pre-save comparison, load 3 is the recovery read. */
async function reachRecoveryRead() {
  let stored = createEmptyProfile();
  let loads = 0;
  const started = deferred<void>();
  const latest = deferred<Profile>();
  const repository = repositoryWith(async () => {
    loads += 1;
    if (loads < 3) return structuredClone(stored);
    started.resolve();
    return latest.promise;
  });
  await act(async () => {
    render(
      <PageImport
        repository={repository}
        readCandidates={readSchool}
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
  });
  screen.getByText("프로필에 가져올 정보");
  stored = { ...stored, contact: { email: "changed@example.test" } };
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /프로필에 저장하기/ }));
    await started.promise;
  });
  return { repository, latest, changed: stored };
}

it("claims the profile was reloaded only after the reload resolves", async () => {
  const { repository, latest, changed } = await reachRecoveryRead();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await act(async () => {
    latest.resolve(structuredClone(changed));
  });
  expect(screen.getByRole("alert")).toBeVisible();
  expect(
    screen.getByRole("button", { name: /프로필에 저장하기/ }),
  ).toBeVisible();
  expect(repository.save).not.toHaveBeenCalled();
});

it("reports a failed reload separately and offers to read again", async () => {
  const { repository, latest } = await reachRecoveryRead();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await act(async () => {
    latest.reject(new Error("synthetic reload failure"));
  });
  expect(screen.getByRole("button", { name: "다시 읽기" })).toBeVisible();
  expect(screen.getByRole("alert")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /프로필에 저장하기/ }),
  ).not.toBeInTheDocument();
  expect(repository.save).not.toHaveBeenCalled();
});

it("shows only the read failure, not an empty-result notice", async () => {
  await act(async () => {
    render(
      <PageImport
        repository={repositoryWith(async () => createEmptyProfile())}
        readCandidates={async () => {
          throw new Error("synthetic read failure");
        }}
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
  });
  expect(screen.getByRole("button", { name: "다시 읽기" })).toBeVisible();
  expect(screen.getByRole("alert")).toBeVisible();
  expect(document.querySelector(`.${styles.empty}`)).toBeNull();
});

it("lists skipped reasons even when every candidate is unsupported", async () => {
  await act(async () => {
    render(
      <PageImport
        repository={repositoryWith(async () => createEmptyProfile())}
        readCandidates={async () => [
          unsupported("a.first", "empty"),
          unsupported("b.second", "hidden_or_inert"),
        ]}
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
  });
  fireEvent.click(screen.getByText(/가져올 수 없는 2개/));
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
});
