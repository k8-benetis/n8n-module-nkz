"""Unit tests for tenant config service."""

import json
from unittest.mock import MagicMock

import pytest
from app.common.tenant_config_service import (
    get_tenant_config,
    upsert_tenant_config,
    mask_api_key,
)


# ---------------------------------------------------------------------------
# mask_api_key unit tests (no DB required)
# ---------------------------------------------------------------------------


def test_mask_api_key_short():
    result = mask_api_key("abc")
    assert result == "***"


def test_mask_api_key_normal():
    result = mask_api_key("n8n_api_abc1234567890xyz")
    assert result == "****xyz"


def test_mask_api_key_empty():
    result = mask_api_key("")
    assert result == "****"


def test_mask_api_key_none():
    result = mask_api_key(None)
    assert result is None


# ---------------------------------------------------------------------------
# Fixture: in-memory mock of the tenant_module_config table
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_db(monkeypatch):
    """Replace get_db_connection_safe with an in-memory mock store."""
    store: dict[str, dict] = {}

    mock_cursor = MagicMock()

    def execute_side_effect(query, params=None):
        if not params:
            return
        if "SELECT" in query:
            tenant_id = params[0]
            # Simulate fetching a JSONB column
            entry = store.get(tenant_id)
            mock_cursor.fetchone.return_value = (
                (entry,) if entry is not None else None
            )
        else:
            # INSERT / ON CONFLICT: params = (tenant_id, json_config_string)
            tenant_id = params[0]
            config_raw = params[-1]  # Last param is the JSON-dumped config
            store[tenant_id] = json.loads(config_raw)

    mock_cursor.execute.side_effect = execute_side_effect

    mock_conn = MagicMock()
    mock_conn.cursor.return_value = mock_cursor

    monkeypatch.setattr(
        "app.common.tenant_config_service.get_db_connection_safe",
        lambda: mock_conn,
    )
    return store


# ---------------------------------------------------------------------------
# CRUD tests (require mock_db fixture)
# ---------------------------------------------------------------------------


def test_get_tenant_config_not_found():
    """Returns None when no config exists for tenant."""
    result = get_tenant_config("nonexistent-tenant")
    assert result is None


def test_upsert_and_get_tenant_config(mock_db):
    """Upsert creates config, get returns it."""
    tenant = "test-tenant-001"
    config = {
        "n8n_url": "https://n8n.test.example.com",
        "n8n_api_key_encrypted": "encrypted-key-value",
    }
    ok = upsert_tenant_config(tenant, config)
    assert ok is True

    retrieved = get_tenant_config(tenant)
    assert retrieved is not None
    assert retrieved["n8n_url"] == config["n8n_url"]
    assert retrieved["n8n_api_key_encrypted"] == config["n8n_api_key_encrypted"]


def test_upsert_updates_existing(mock_db):
    """Upsert updates config when row already exists."""
    tenant = "test-tenant-002"
    upsert_tenant_config(tenant, {"n8n_url": "https://old.example.com"})
    upsert_tenant_config(tenant, {"n8n_url": "https://new.example.com"})

    retrieved = get_tenant_config(tenant)
    assert retrieved["n8n_url"] == "https://new.example.com"
