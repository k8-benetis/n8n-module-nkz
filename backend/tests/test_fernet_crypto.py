"""Unit tests for Fernet encryption module."""

import pytest
from cryptography.fernet import Fernet


# Generate a fixed key for deterministic tests
TEST_KEY = Fernet.generate_key().decode()


def _setup_key(monkeypatch, key: str) -> None:
    """Set N8N_ENCRYPTION_KEY and clear all relevant caches."""
    monkeypatch.setenv("N8N_ENCRYPTION_KEY", key)
    from app.config import get_settings

    get_settings.cache_clear()
    # Clear _get_key cache if the module has already been imported
    try:
        from app.common import fernet_crypto

        fernet_crypto._get_key.cache_clear()
    except (ImportError, ModuleNotFoundError):
        pass


def test_encrypt_decrypt_round_trip(monkeypatch):
    """Encrypt then decrypt returns original plaintext."""
    _setup_key(monkeypatch, TEST_KEY)
    from app.common.fernet_crypto import encrypt_token, decrypt_token

    plain = "n8n_api_abc123secret"
    cipher = encrypt_token(plain)
    assert cipher != plain
    assert decrypt_token(cipher) == plain


def test_encrypt_produces_different_ciphertext(monkeypatch):
    """Same plaintext encrypted twice yields different ciphertext (IV)."""
    _setup_key(monkeypatch, TEST_KEY)
    from app.common.fernet_crypto import encrypt_token

    plain = "n8n_api_key"
    c1 = encrypt_token(plain)
    c2 = encrypt_token(plain)
    assert c1 != c2


def test_decrypt_tampered_raises(monkeypatch):
    """Decrypting tampered ciphertext raises error."""
    _setup_key(monkeypatch, TEST_KEY)
    from app.common.fernet_crypto import decrypt_token

    with pytest.raises(Exception):
        decrypt_token("not-valid-fernet-ciphertext")


def test_generates_key_when_not_configured(monkeypatch):
    """When N8N_ENCRYPTION_KEY is empty, generates a temp key (dev only)."""
    _setup_key(monkeypatch, "")
    from app.common.fernet_crypto import encrypt_token, decrypt_token

    plain = "test-token"
    cipher = encrypt_token(plain)
    assert decrypt_token(cipher) == plain
