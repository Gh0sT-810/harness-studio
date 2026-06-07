from collections.abc import Iterator
from contextlib import contextmanager

from app.settings import get_settings


@contextmanager
def connect() -> Iterator[object]:
    import psycopg

    with psycopg.connect(get_settings().database_url) as connection:
        yield connection


def check_postgres() -> bool:
    try:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                return cursor.fetchone() == (1,)
    except Exception:
        return False
