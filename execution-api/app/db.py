from contextlib import contextmanager
from threading import Lock
from typing import Iterator

from app.settings import get_settings

_pool = None
_pool_lock = Lock()


def _get_pool():
    """Lazily build one shared psycopg connection pool.

    Built on first use (not at import) so the test suite, which never touches a
    real database, does not try to open a pool. With N concurrent worker
    replicas each opening several short-lived connections per iteration, a pool
    reuses warm connections instead of storming ``psycopg.connect()`` per call.
    """
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                from psycopg_pool import ConnectionPool

                settings = get_settings()
                pool = ConnectionPool(
                    conninfo=settings.database_url,
                    min_size=settings.db_pool_min_size,
                    max_size=settings.db_pool_max_size,
                    open=False,
                )
                pool.open()
                _pool = pool
    return _pool


@contextmanager
def connect() -> Iterator[object]:
    with _get_pool().connection() as connection:
        yield connection


def check_postgres() -> bool:
    try:
        # Short acquire timeout so the health endpoint fails fast when the DB is
        # down instead of blocking on the pool's default 30s wait.
        with _get_pool().connection(timeout=5) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                return cursor.fetchone() == (1,)
    except Exception:
        return False
