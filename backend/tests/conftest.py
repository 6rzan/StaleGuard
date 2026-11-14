import pytest

from app import mock, store
from app.config import Settings


@pytest.fixture(autouse=True)
def no_search_delay(monkeypatch):
    monkeypatch.setattr(mock, "SEARCH_DELAY_S", 0)


@pytest.fixture
def settings(tmp_path) -> Settings:
    s = Settings(mock_mode=True, database_path=tmp_path / "test.db")
    store.init(s.database_path)
    return s
