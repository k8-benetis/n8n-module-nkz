"""Unit tests for tenant ID sanitization."""

from app.common.sanitize import sanitize_tenant_id, n8n_resource_name, n8n_db_name


def test_sanitize_lowercases():
    assert sanitize_tenant_id("AcmeCorp") == "acmecorp"


def test_sanitize_replaces_underscore():
    assert sanitize_tenant_id("acme_corp") == "acme-corp"


def test_sanitize_truncates_long():
    long_id = "a" * 100
    assert len(sanitize_tenant_id(long_id)) == 63


def test_n8n_resource_name():
    assert n8n_resource_name("acme-corp") == "n8n-acme-corp"


def test_n8n_db_name():
    assert n8n_db_name("acme-corp") == "n8n_acme_corp"
