"""
Tenant configuration CRUD service for n8n-nkz module.

Stores per-tenant config in `admin_platform.tenant_module_config` table
(migration: backend/migrations/001_tenant_module_config.sql).
"""

import json
import logging

from app.common.db import get_db_connection_safe

logger = logging.getLogger(__name__)

TABLE = "admin_platform.tenant_module_config"


def mask_api_key(key: str | None) -> str | None:
    """Mask an API key for safe logging / display."""
    if key is None:
        return None
    if not key:  # empty string -> "****" sentinel
        return "****"
    if len(key) <= 4:
        return "***"
    return "****" + key[-3:]


def get_tenant_config(tenant_id: str) -> dict | None:
    """Retrieve the n8n config for a tenant, or None if not found."""
    conn = get_db_connection_safe()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT config FROM {TABLE} WHERE tenant_id = %s AND module_id = 'n8n-nkz'",
            (tenant_id,),
        )
        row = cur.fetchone()
        cur.close()
        if row:
            return row[0] if isinstance(row[0], dict) else json.loads(row[0])
        return None
    except Exception as e:
        logger.warning("get_tenant_config(%s): %s", tenant_id, e)
        return None
    finally:
        conn.close()


def upsert_tenant_config(tenant_id: str, config: dict) -> bool:
    """Create or update the n8n config for a tenant. Returns True on success."""
    conn = get_db_connection_safe()
    if not conn:
        return False
    try:
        cur = conn.cursor()
        cur.execute(
            f"""
            INSERT INTO {TABLE} (tenant_id, module_id, config, updated_at)
            VALUES (%s, 'n8n-nkz', %s::jsonb, NOW())
            ON CONFLICT (tenant_id, module_id) DO UPDATE SET
                config = EXCLUDED.config,
                updated_at = NOW()
            """,
            (tenant_id, json.dumps(config)),
        )
        conn.commit()
        cur.close()
        return True
    except Exception as e:
        logger.error("upsert_tenant_config(%s): %s", tenant_id, e)
        conn.rollback()
        return False
    finally:
        conn.close()
