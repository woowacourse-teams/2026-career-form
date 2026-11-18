import json
import tempfile
import unittest
from pathlib import Path

from pushload.records import load_subscribers, read_jsonl, valid_samples
from pushload.webpush import new_subscriber_keys


class ReadJsonlTest(unittest.TestCase):
    def test_skips_blank_and_broken_lines(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "x.jsonl"
            path.write_text('{"a": 1}\n\n{broken\n[1, 2]\n')
            self.assertEqual(([{"a": 1}, [1, 2]], 1), read_jsonl(path))
            self.assertEqual(([], 0), read_jsonl(Path(directory) / "missing.jsonl"))


class LoadSubscribersTest(unittest.TestCase):
    def test_maps_paths_and_counts_invalid_records(self):
        keys = new_subscriber_keys()
        records = [{"id": "a" * 32, "path": "/p/a", **keys.to_record()}, {"path": "/p/b"}, {"id": "c", "path": "/p/c", "privateKey": "x",
                                                                                         "p256dh": "y", "auth": "z"}, "not a record"]
        subscribers, invalid = load_subscribers(records)
        self.assertEqual((["/p/a"], 3), (list(subscribers), invalid))
        self.assertEqual(("a" * 32, keys), (subscribers["/p/a"].id, subscribers["/p/a"].keys))


class ValidSamplesTest(unittest.TestCase):
    def test_keeps_only_well_formed_samples(self):
        good = {"at": 1.0, "containers": {"b": {"cpuPercent": 1.0}}, "metrics": [["m", {}, 1.0]], "errors": []}
        bad = [{"at": True}, {"at": "1"}, {"at": 1.0, "containers": {"b": "x"}}, {"at": 1.0, "metrics": [["m", {}]]},
               {"at": 1.0, "metrics": [["m", [], 1.0]]}, {"at": 1.0, "metrics": [["m", {}, "1"]]}, {"at": 1.0, "errors": "x"}, ["at"]]
        self.assertEqual(([good, {"at": 2}], len(bad)), valid_samples([good, *bad, {"at": 2}]))


if __name__ == "__main__":
    unittest.main()
