"""테스트용 MongoDB 대역. 시험 도구가 쓰는 연산과 필터만 흉내 낸다."""

import re
from dataclasses import dataclass

_MISSING = object()


def matches(document, query):
    for key, condition in (query or {}).items():
        if key == "$or":
            if not any(matches(document, part) for part in condition):
                return False
        elif not _match_value(document.get(key, _MISSING), condition):
            return False
    return True


def _match_value(value, condition):
    if not (isinstance(condition, dict) and condition and all(key.startswith("$") for key in condition)):
        return value == condition
    for operator, argument in condition.items():
        if not _OPERATORS[operator](value, argument):
            return False
    return True


_OPERATORS = {
    "$regex": lambda value, pattern: isinstance(value, str) and re.search(pattern, value) is not None,
    "$in": lambda value, values: value in values,
    "$nin": lambda value, values: value not in values,
    "$exists": lambda value, expected: (value is not _MISSING) == expected,
    "$ne": lambda value, other: value != other,
}


@dataclass
class DeleteResult:
    deleted_count: int


class FakeCollection:
    def __init__(self, name, documents, log):
        self.name = name
        self.documents = [dict(document) for document in documents]
        self.log = log
        self.storage_stats = None

    def aggregate(self, pipeline):
        self.log.append((self.name, "aggregate", pipeline, None))
        if pipeline == [{"$collStats": {"storageStats": {}}}]:
            return iter([{"storageStats": self.storage_stats or {"count": len(self.documents), "size": 0, "storageSize": 0, "totalIndexSize": 0}}])
        raise NotImplementedError(pipeline)

    def find(self, query=None, projection=None):
        self.log.append((self.name, "find", query, projection))
        return [self._project(document, projection) for document in self.documents if matches(document, query)]

    def find_one(self, query=None, projection=None):
        found = self.find(query, projection)
        return found[0] if found else None

    def count_documents(self, query):
        self.log.append((self.name, "count", query, None))
        return sum(1 for document in self.documents if matches(document, query))

    def insert_many(self, documents, ordered=True):
        self.log.append((self.name, "insert_many", len(documents), ordered))
        self.documents.extend(dict(document) for document in documents)

    def delete_many(self, query):
        self.log.append((self.name, "delete_many", query, None))
        kept = [document for document in self.documents if not matches(document, query)]
        deleted = len(self.documents) - len(kept)
        self.documents = kept
        return DeleteResult(deleted)

    @staticmethod
    def _project(document, projection):
        if not projection:
            return dict(document)
        included = {key for key, value in projection.items() if value}
        result = {key: document[key] for key in included if key in document}
        if projection.get("_id", 1) and "_id" in document:
            result["_id"] = document["_id"]
        return result


class FakeDatabase:
    def __init__(self, **collections):
        self.log = []
        self._collections = {name: FakeCollection(name, documents, self.log) for name, documents in collections.items()}

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return self._collections.setdefault(name, FakeCollection(name, (), self.log))

    def __getitem__(self, name):
        return getattr(self, name)

    def writes(self):
        return [entry for entry in self.log if entry[1] in ("insert_many", "delete_many")]
