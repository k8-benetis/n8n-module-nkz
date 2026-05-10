"""Unit tests for n8n provisioner (non-K8s parts)."""

from app.common.n8n_provisioner import generate_credentials


def test_generate_credentials_returns_dict():
    creds = generate_credentials()
    assert "username" in creds
    assert "password" in creds
    assert "api_key" in creds


def test_generate_credentials_unique():
    creds1 = generate_credentials()
    creds2 = generate_credentials()
    assert creds1["username"] != creds2["username"]
    assert creds1["password"] != creds2["password"]
    assert creds1["api_key"] != creds2["api_key"]


def test_generate_credentials_lengths():
    creds = generate_credentials()
    assert len(creds["username"]) > 6
    assert len(creds["password"]) >= 16
    assert len(creds["api_key"]) >= 24
