import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path

from pushload.runfiles import iso, parse_iso, read_run, update_run, validate_run_id, with_section, write_run

UTC = dt.timezone.utc


class RunIdTest(unittest.TestCase):
    def test_validates_run_id_characters(self):
        self.assertEqual("ok-1", validate_run_id("ok-1"))
        for value in ("", "bad/1", "bad 1", "a" * 41, None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_run_id(value)


class RunFileTest(unittest.TestCase):
    def test_missing_run_reads_as_empty(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual({}, read_run(Path(directory)))

    def test_with_section_returns_new_mapping(self):
        original = {"runId": "r1", "subscriptions": {"count": 3}}
        updated = with_section(original, "postings", {"count": 1})
        self.assertEqual({"runId": "r1", "subscriptions": {"count": 3}, "postings": {"count": 1}}, updated)
        self.assertEqual({"runId": "r1", "subscriptions": {"count": 3}}, original)

    def test_write_then_read_round_trips_without_leftovers(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            write_run(path, {"runId": "r1", "note": "한글"})
            self.assertEqual({"runId": "r1", "note": "한글"}, read_run(path))
            self.assertEqual(["run.json"], sorted(item.name for item in path.iterdir()))
            self.assertIn("한글", (path / "run.json").read_text(encoding="utf-8"))
            self.assertEqual("r1", json.loads((path / "run.json").read_text())["runId"])

    def test_update_run_replaces_one_section_and_keeps_others(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "r1"
            update_run(path, "r1", "subscriptions", {"count": 3})
            update_run(path, "r1", "postings", {"count": 1})
            update_run(path, "r1", "postings", {"count": 2})
            self.assertEqual({"runId": "r1", "subscriptions": {"count": 3}, "postings": {"count": 2}}, read_run(path))


class IsoTest(unittest.TestCase):
    def test_formats_milliseconds_in_utc(self):
        moment = dt.datetime(2026, 11, 9, 1, 2, 3, 123456, tzinfo=UTC)
        self.assertEqual("2026-11-09T01:02:03.123Z", iso(moment))

    def test_parses_java_instant_with_nanoseconds(self):
        parsed = parse_iso("2026-11-09T10:09:27.271790847Z")
        self.assertEqual(dt.datetime(2026, 11, 9, 10, 9, 27, 271790, tzinfo=UTC), parsed)

    def test_parses_whole_seconds_and_offsets(self):
        self.assertEqual(dt.datetime(2026, 11, 9, 10, 9, 27, tzinfo=UTC), parse_iso("2026-11-09T10:09:27Z"))
        self.assertEqual(dt.datetime(2026, 11, 9, 1, 9, 27, tzinfo=UTC), parse_iso("2026-11-09T10:09:27+09:00"))

    def test_rejects_invalid_text(self):
        for text in ("", "yesterday", None):
            with self.subTest(text=text), self.assertRaises(ValueError):
                parse_iso(text)


if __name__ == "__main__":
    unittest.main()
