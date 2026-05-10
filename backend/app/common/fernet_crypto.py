"""
Fernet encryption module for API key storage.

Uses `N8N_ENCRYPTION_KEY` from settings. Falls back to a generated
key when the env var is empty (development only -- all ciphertext
becomes undecryptable on restart).
"""

from functools import lru_cache

from cryptography.fernet import Fernet

from app.config import get_settings


@lru_cache()
def _get_key() -> bytes:
    key = get_settings().n8n_encryption_key
    if key:
        return key.encode()
    return Fernet.generate_key()


def get_fernet() -> Fernet:
    return Fernet(_get_key())


def encrypt_token(plain: str) -> str:
    return get_fernet().encrypt(plain.encode()).decode()


def decrypt_token(cipher: str) -> str:
    return get_fernet().decrypt(cipher.encode()).decode()
