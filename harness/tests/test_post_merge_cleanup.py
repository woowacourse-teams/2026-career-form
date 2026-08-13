import unittest

from harness.lib.post_merge_cleanup import (
    CleanupSnapshot,
    WorktreeState,
    cleanup_snapshot_from,
    plan_cleanup,
)


class PostMergeCleanupTest(unittest.TestCase):
    def test_blocks_cleanup_until_remote_merge_is_proven(self) -> None:
        snapshot = self._snapshot(pr_state="OPEN")

        plan = plan_cleanup(snapshot)

        self.assertEqual("blocked", plan.status)
        self.assertEqual((), plan.remove_worktrees)
        self.assertFalse(plan.delete_local_branch)

    def test_blocks_cleanup_until_merge_commit_is_in_origin_develop(self) -> None:
        snapshot = self._snapshot(merge_in_origin_develop=False)

        plan = plan_cleanup(snapshot)

        self.assertEqual("blocked", plan.status)
        self.assertIn("origin/develop", plan.reason)

    def test_blocks_cleanup_for_invalid_merge_commit_oid(self) -> None:
        snapshot = self._snapshot(merge_commit="not-a-commit")

        plan = plan_cleanup(snapshot)

        self.assertEqual("blocked", plan.status)
        self.assertIn("merge commit", plan.reason)

    def test_preserves_dirty_and_external_worktrees(self) -> None:
        snapshot = self._snapshot(
            worktrees=(
                WorktreeState("/managed-clean", clean=True, managed=True),
                WorktreeState("/managed-dirty", clean=False, managed=True),
                WorktreeState("/external", clean=True, managed=False),
            )
        )

        plan = plan_cleanup(snapshot)

        self.assertEqual(("/managed-clean",), plan.remove_worktrees)
        self.assertEqual(("/managed-dirty", "/external"), plan.preserve_worktrees)
        self.assertFalse(plan.delete_local_branch)

    def test_deletes_local_branch_after_all_attached_worktrees_are_safe(self) -> None:
        snapshot = self._snapshot(
            worktrees=(WorktreeState("/managed-clean", clean=True, managed=True),)
        )

        plan = plan_cleanup(snapshot)

        self.assertEqual("ready", plan.status)
        self.assertTrue(plan.delete_local_branch)

    def test_is_complete_when_safe_targets_are_already_absent(self) -> None:
        snapshot = self._snapshot(worktrees=(), local_branch_exists=False)

        plan = plan_cleanup(snapshot)

        self.assertEqual("complete", plan.status)
        self.assertEqual((), plan.remove_worktrees)
        self.assertFalse(plan.delete_local_branch)

    def test_parses_validated_worktree_snapshot(self) -> None:
        snapshot = cleanup_snapshot_from(
            {
                "issue_number": 14,
                "issue_state": "CLOSED",
                "pr_state": "MERGED",
                "head_branch": "CF-14",
                "base_branch": "develop",
                "merge_commit": "a" * 40,
                "merge_in_origin_develop": True,
                "local_branch_exists": True,
                "worktrees": [
                    {"path": "/managed", "clean": True, "managed": True}
                ],
            }
        )

        self.assertEqual((WorktreeState("/managed", True, True),), snapshot.worktrees)

    def test_rejects_string_cleanup_boolean(self) -> None:
        payload = {
            "issue_number": 14,
            "issue_state": "CLOSED",
            "pr_state": "MERGED",
            "head_branch": "CF-14",
            "base_branch": "develop",
            "merge_commit": "a" * 40,
            "merge_in_origin_develop": "true",
            "local_branch_exists": True,
            "worktrees": [],
        }

        with self.assertRaisesRegex(ValueError, "merge_in_origin_develop"):
            cleanup_snapshot_from(payload)

    def _snapshot(self, **changes: object) -> CleanupSnapshot:
        values: dict[str, object] = {
            "issue_number": 14,
            "issue_state": "CLOSED",
            "pr_state": "MERGED",
            "head_branch": "CF-14",
            "base_branch": "develop",
            "merge_commit": "a" * 40,
            "merge_in_origin_develop": True,
            "local_branch_exists": True,
            "worktrees": (),
        }
        values.update(changes)
        return CleanupSnapshot(**values)  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
