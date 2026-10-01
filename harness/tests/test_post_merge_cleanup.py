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

    def test_blocks_cleanup_until_merge_commit_is_in_origin_base(self) -> None:
        snapshot = self._snapshot(merge_in_origin_base=False)

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

    def test_allows_hotfix_cleanup_after_merge_is_proven_on_main(self) -> None:
        snapshot = self._snapshot(
            head_branch="hotfix/CF-14",
            base_branch="main",
        )

        plan = plan_cleanup(snapshot)

        self.assertEqual("ready", plan.status)
        self.assertTrue(plan.delete_local_branch)

    def test_allows_release_fix_cleanup_after_merge_is_proven_on_release(self) -> None:
        snapshot = self._snapshot(base_branch="release/1.2.3")

        plan = plan_cleanup(snapshot)

        self.assertEqual("ready", plan.status)
        self.assertTrue(plan.delete_local_branch)

    def test_blocks_cleanup_for_invalid_issue_branch_routes(self) -> None:
        invalid_routes = (
            ("hotfix/CF-14", "develop"),
            ("CF-14", "main"),
            ("CF-14", "release/1.2"),
            ("CF-15", "develop"),
            ("hotfix/CF-15", "main"),
        )

        for head_branch, base_branch in invalid_routes:
            with self.subTest(head_branch=head_branch, base_branch=base_branch):
                plan = plan_cleanup(
                    self._snapshot(
                        head_branch=head_branch,
                        base_branch=base_branch,
                    )
                )

                self.assertEqual("blocked", plan.status)
                self.assertIn("브랜치 연결", plan.reason)
                self.assertFalse(plan.delete_local_branch)

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
                "merge_in_origin_base": True,
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
            "merge_in_origin_base": "true",
            "local_branch_exists": True,
            "worktrees": [],
        }

        with self.assertRaisesRegex(ValueError, "merge_in_origin_base"):
            cleanup_snapshot_from(payload)

    def _snapshot(self, **changes: object) -> CleanupSnapshot:
        values: dict[str, object] = {
            "issue_number": 14,
            "issue_state": "CLOSED",
            "pr_state": "MERGED",
            "head_branch": "CF-14",
            "base_branch": "develop",
            "merge_commit": "a" * 40,
            "merge_in_origin_base": True,
            "local_branch_exists": True,
            "worktrees": (),
        }
        values.update(changes)
        return CleanupSnapshot(**values)  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
