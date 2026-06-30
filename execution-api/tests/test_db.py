from contextlib import contextmanager

import psycopg_pool
import pytest

from app import db


class _FakeCursor:
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def execute(self, sql, params=()):
        self.sql = sql

    def fetchone(self):
        return (1,)


class _FakeConn:
    def cursor(self):
        return _FakeCursor()


def _install_fake_pool(monkeypatch):
    state = {"constructed": 0, "opened": 0, "checkouts": 0, "returns": 0}

    class FakePool:
        def __init__(self, conninfo, min_size, max_size, open):
            state["constructed"] += 1

        def open(self):
            state["opened"] += 1

        @contextmanager
        def connection(self, timeout=None):
            state["checkouts"] += 1
            try:
                yield _FakeConn()
            finally:
                state["returns"] += 1

    monkeypatch.setattr(psycopg_pool, "ConnectionPool", FakePool)
    monkeypatch.setattr(db, "_pool", None)
    return state


def test_connect_uses_single_shared_pool(monkeypatch):
    # POOL-01: the pool is built once (lazily) and reused for every connect().
    state = _install_fake_pool(monkeypatch)

    with db.connect():
        pass
    with db.connect():
        pass

    assert state["constructed"] == 1
    assert state["opened"] == 1
    assert state["checkouts"] == 2
    assert state["returns"] == 2


def test_connect_returns_connection_on_exception(monkeypatch):
    # POOL-03: connection is released back to the pool even when the body raises.
    state = _install_fake_pool(monkeypatch)

    with pytest.raises(RuntimeError):
        with db.connect():
            raise RuntimeError("boom")

    assert state["returns"] == 1


def test_check_postgres_true_when_pool_healthy(monkeypatch):
    # POOL-04 (healthy): SELECT 1 → True.
    _install_fake_pool(monkeypatch)

    assert db.check_postgres() is True


def test_check_postgres_false_when_pool_unavailable(monkeypatch):
    # POOL-04 (down): a failing connection acquire → False, never raises.
    class BrokenPool:
        def __init__(self, **kwargs):
            pass

        def open(self):
            pass

        @contextmanager
        def connection(self, timeout=None):
            raise RuntimeError("db down")
            yield  # pragma: no cover

    monkeypatch.setattr(psycopg_pool, "ConnectionPool", lambda **kwargs: BrokenPool())
    monkeypatch.setattr(db, "_pool", None)

    assert db.check_postgres() is False
