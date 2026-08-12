import json
import tempfile
import unittest
from pathlib import Path

from harness.lib.project_config import ProjectConfigError, load_project_config


class ProjectConfigTest(unittest.TestCase):
    def test_loads_project_coordinates(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "project.json"
            path.write_text(
                json.dumps(
                    {
                        "owner": "woowacourse-teams",
                        "number": 149,
                        "repository": "2026-career-form",
                    }
                ),
                encoding="utf-8",
            )

            config = load_project_config(path)

        self.assertEqual("woowacourse-teams", config.owner)
        self.assertEqual(149, config.number)
        self.assertEqual("2026-career-form", config.repository)

    def test_rejects_missing_project_coordinate(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "project.json"
            path.write_text('{"owner": "woowacourse-teams"}', encoding="utf-8")

            with self.assertRaisesRegex(ProjectConfigError, "number"):
                load_project_config(path)

    def test_normalizes_invalid_utf8_as_project_config_error(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "project.json"
            path.write_bytes(b"\xff")

            with self.assertRaisesRegex(ProjectConfigError, "읽을 수 없습니다"):
                load_project_config(path)


if __name__ == "__main__":
    unittest.main()
