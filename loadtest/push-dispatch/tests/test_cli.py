import unittest

from pushload.cli import UsageError, connect_database, parse_notes, require_env


class RequireEnvTest(unittest.TestCase):
    def test_returns_value(self):
        self.assertEqual("v", require_env({"NAME": "v"}, "NAME"))

    def test_missing_or_blank_value_names_variable_only(self):
        for environ in ({}, {"NAME": "  "}):
            with self.subTest(environ=environ), self.assertRaisesRegex(UsageError, "NAME"):
                require_env(environ, "NAME")


class ConnectTest(unittest.TestCase):
    def test_uses_database_from_uri_without_connecting(self):
        database = connect_database("mongodb://127.0.0.1:1/career_form_loadtest")
        self.assertEqual("career_form_loadtest", database.name)
        database.client.close()

    def test_requires_database_name_without_echoing_uri(self):
        with self.assertRaises(UsageError) as raised:
            connect_database("mongodb://user:db-password@127.0.0.1:1/")
        self.assertNotIn("db-password", str(raised.exception))

    def test_rejects_malformed_uri_without_echoing_it(self):
        with self.assertRaises(UsageError) as raised:
            connect_database("not-a-uri-db-password")
        self.assertNotIn("db-password", str(raised.exception))


class NotesTest(unittest.TestCase):
    def test_parses_key_value_pairs(self):
        self.assertEqual({"commit": "abc", "concurrency": "20", "empty": ""}, parse_notes(["commit=abc", "concurrency=20", "empty="]))

    def test_rejects_malformed_or_duplicate_notes(self):
        for notes in (["novalue"], ["=x"], ["a=1", "a=2"]):
            with self.subTest(notes=notes), self.assertRaises(UsageError):
                parse_notes(notes)


if __name__ == "__main__":
    unittest.main()
