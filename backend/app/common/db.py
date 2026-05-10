import psycopg2
from app.config import get_settings


def get_db_connection():
    """Get a psycopg2 connection from the configured DATABASE_URL."""
    url = get_settings().database_url
    if not url:
        raise RuntimeError("DATABASE_URL not configured")
    return psycopg2.connect(url)


def get_db_connection_safe():
    """Get a psycopg2 connection, or None if not configured."""
    try:
        return get_db_connection()
    except Exception:
        return None
