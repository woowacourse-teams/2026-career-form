import unittest

from harness.lib.project_access import diagnose_project_access


class ProjectAccessTest(unittest.TestCase):
    def test_reports_missing_github_cli(self) -> None:
        diagnosis = diagnose_project_access(False, None, None, "")

        self.assertEqual("gh_missing", diagnosis.code)
        self.assertEqual(("https://cli.github.com/",), diagnosis.resolutions)

    def test_reports_unauthenticated_cli(self) -> None:
        diagnosis = diagnose_project_access(True, 1, None, "")

        self.assertEqual("unauthenticated", diagnosis.code)
        self.assertEqual(("gh auth login",), diagnosis.resolutions)

    def test_reports_missing_project_scope(self) -> None:
        diagnosis = diagnose_project_access(
            True,
            0,
            1,
            "error: your token has not been granted the required scopes [project]",
        )

        self.assertEqual("project_scope_missing", diagnosis.code)
        self.assertEqual(("gh auth refresh -s project",), diagnosis.resolutions)

    def test_reports_unavailable_project_without_exposing_error(self) -> None:
        diagnosis = diagnose_project_access(
            True,
            0,
            1,
            "GraphQL: Could not resolve to a ProjectV2 with the number 149",
        )

        self.assertEqual("project_unavailable", diagnosis.code)
        self.assertNotIn("GraphQL", diagnosis.message)
        self.assertEqual((), diagnosis.resolutions)

    def test_reports_ready_access(self) -> None:
        diagnosis = diagnose_project_access(True, 0, 0, "")

        self.assertEqual("ready", diagnosis.code)
        self.assertEqual((), diagnosis.resolutions)


if __name__ == "__main__":
    unittest.main()
