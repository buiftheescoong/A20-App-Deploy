import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, Any

# Đường dẫn file mock_db.json tại root
MOCK_DB_PATH = Path(__name__).parent.parent.parent / "mock_db.json"


class MockTable:
    def __init__(self, table_name: str, data: dict):
        self.table_name = table_name
        self.data = data
        if table_name not in self.data:
            self.data[table_name] = []

    def insert(self, record: dict):
        if "id" not in record:
            record["id"] = str(uuid.uuid4())
        if "created_at" not in record:
            record["created_at"] = datetime.utcnow().isoformat()

        self.data[self.table_name].append(record)
        self._save()
        return self

    def select(self, *args, **kwargs):
        # Đơn giản hóa: trả về toàn bộ dữ liệu hiện có để filter sau
        self._current_query = self.data[self.table_name]
        return self

    def eq(self, column: str, value: Any):
        self._current_query = [r for r in self._current_query if r.get(column) == value]
        return self

    def single(self):
        self.data = self._current_query[0] if self._current_query else None
        return self

    def order(self, column: str, desc: bool = False):
        self._current_query.sort(key=lambda x: x.get(column), reverse=desc)
        return self

    def range(self, start: int, end: int):
        self._current_query = self._current_query[start : end + 1]
        return self

    def update(self, updates: dict):
        for r in self._current_query:
            r.update(updates)
        self._save()
        return self

    def delete(self):
        ids_to_delete = [r["id"] for r in self._current_query]
        self.data[self.table_name] = [
            r for r in self.data[self.table_name] if r["id"] not in ids_to_delete
        ]
        self._save()
        return self

    def execute(self):
        # Giả lập kết quả trả về của Supabase PostgrestResponse
        class Response:
            def __init__(self, data):
                self.data = data

        # Nếu là chuỗi filter, trả về kết quả filter
        if hasattr(self, "_current_query"):
            res = Response(self._current_query)
            del self._current_query
            return res

        # Nếu đã gọi single(), self.data sẽ chứa 1 bản ghi hoặc None
        return Response(self.data)

    def _save(self):
        with open(MOCK_DB_PATH, "w", encoding="utf-8") as f:
            json.dump(self.data, f, indent=2, ensure_ascii=False)


class MockSupabase:
    def __init__(self):
        if not MOCK_DB_PATH.exists():
            with open(MOCK_DB_PATH, "w", encoding="utf-8") as f:
                json.dump({}, f)

        with open(MOCK_DB_PATH, "r", encoding="utf-8") as f:
            try:
                self.all_data = json.load(f)
            except json.JSONDecodeError:
                self.all_data = {}

    def table(self, table_name: str):
        return MockTable(table_name, self.all_data)

    class Storage:
        def from_(self, bucket: str):
            class Bucket:
                def get_public_url(self, path: str):
                    return f"http://localhost:8000/mock-storage/{bucket}/{path}"

            return Bucket()

    @property
    def storage(self):
        return self.Storage()


# Singleton instance
mock_supabase = MockSupabase()
