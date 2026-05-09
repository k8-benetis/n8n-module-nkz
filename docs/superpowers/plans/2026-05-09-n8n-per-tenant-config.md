# Per-Tenant External n8n Configuration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each tenant can configure their own n8n instance (URL + API key). Backend resolves n8n credentials per tenant from PostgreSQL with Fernet encryption.

**Architecture:** New `admin_platform.tenant_module_config` table stores JSONB config per tenant. `fernet_crypto.py` handles encryption, `tenant_config_service.py` handles PostgreSQL CRUD. New `/tenant/config` endpoints with TenantAdmin RBAC. `n8n_request()` and `GET /n8n/url` resolve credentials per tenant. Frontend settings panel in `App.tsx` (TenantAdmin only).

**Tech Stack:** FastAPI, psycopg2 (direct, no ORM for config table), cryptography (Fernet), pydantic-settings, React 18 + TypeScript 5, @nekazari/sdk

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `backend/migrations/001_tenant_module_config.sql` | SQL migration |
| Create | `backend/app/common/fernet_crypto.py` | Fernet encrypt/decrypt |
| Create | `backend/app/common/tenant_config_service.py` | PostgreSQL CRUD for tenant config |
| Modify | `backend/app/config.py` | Add `n8n_encryption_key`, `database_url` |
| Create | `backend/app/routers/tenant_config.py` | GET/PUT /tenant/config, POST /tenant/config/test |
| Modify | `backend/app/routers/n8n.py` | Per-tenant resolution in `n8n_request()` and `GET /n8n/url` |
| Modify | `backend/app/main.py` | Register tenant_config router |
| Create | `backend/tests/test_fernet_crypto.py` | Unit tests for encryption round-trip |
| Create | `backend/tests/test_tenant_config.py` | Unit tests for config CRUD |
| Modify | `backend/requirements.txt` | Add `cryptography` |
| Modify | `k8s/backend-deployment.yaml` | Add `N8N_ENCRYPTION_KEY` and `DATABASE_URL` env vars |
| Create | `k8s/secret-template.yaml` | K8s Secret for encryption key |
| Modify | `src/services/api.ts` | Add tenant config API methods |
| Create | `src/hooks/useTenantConfig.ts` | Hook for config panel |
| Modify | `src/App.tsx` | Add settings panel for TenantAdmin |
| Modify | `src/locales/es.json` | Add i18n keys |
| Modify | `src/locales/en.json` | Add i18n keys |
| Modify | `src/hooks/useN8nUrl.ts` | Remove conditional fallback wrappers (already done) |

---

### Task 1: Add cryptography to requirements and create migration

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/migrations/001_tenant_module_config.sql`

- [ ] **Step 1: Add cryptography to requirements.txt**

```diff
 # Database (optional - for webhook configs)
+psycopg2-binary>=2.9
 sqlalchemy>=2.0.0
 asyncpg>=0.29.0
+
+# Encryption
+cryptography>=42.0
```

- [ ] **Step 2: Create migration file**

File: `backend/migrations/001_tenant_module_config.sql`

```sql
-- =============================================================================
-- Per-tenant module configuration (n8n-nkz Phase 1)
-- =============================================================================
-- Uses admin_platform schema (same as tenant_limits).
-- JSONB config column allows future keys without migration.
-- =============================================================================

CREATE TABLE IF NOT EXISTS admin_platform.tenant_module_config (
    tenant_id   TEXT NOT NULL,
    module_id   TEXT NOT NULL DEFAULT 'n8n-nkz',
    config      JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (tenant_id, module_id)
);
```

- [ ] **Step 3: Commit**

```bash
git add backend/requirements.txt backend/migrations/001_tenant_module_config.sql
git commit -m "feat: add tenant_module_config migration and cryptography dep"
```

---

### Task 2: Create Fernet encryption module

**Files:**
- Create: `backend/app/common/fernet_crypto.py`
- Create: `backend/tests/test_fernet_crypto.py`

- [ ] **Step 1: Write failing test**

File: `backend/tests/test_fernet_crypto.py`

```python
"""Unit tests for Fernet encryption module."""

import pytest
from cryptography.fernet import Fernet


# Generate a fixed key for deterministic tests
TEST_KEY = Fernet.generate_key().decode()


def test_encrypt_decrypt_round_trip(monkeypatch):
    """Encrypt then decrypt returns original plaintext."""
    monkeypatch.setenv("N8N_ENCRYPTION_KEY", TEST_KEY)
    from app.common.fernet_crypto import encrypt_token, decrypt_token

    plain = "n8n_api_abc123secret"
    cipher = encrypt_token(plain)
    assert cipher != plain
    assert decrypt_token(cipher) == plain


def test_encrypt_produces_different_ciphertext(monkeypatch):
    """Same plaintext encrypted twice yields different ciphertext (IV)."""
    monkeypatch.setenv("N8N_ENCRYPTION_KEY", TEST_KEY)
    from app.common.fernet_crypto import encrypt_token

    plain = "n8n_api_key"
    c1 = encrypt_token(plain)
    c2 = encrypt_token(plain)
    assert c1 != c2


def test_decrypt_tampered_raises(monkeypatch):
    """Decrypting tampered ciphertext raises error."""
    monkeypatch.setenv("N8N_ENCRYPTION_KEY", TEST_KEY)
    from app.common.fernet_crypto import decrypt_token

    with pytest.raises(Exception):
        decrypt_token("not-valid-fernet-ciphertext")


def test_generates_key_when_not_configured(monkeypatch):
    """When N8N_ENCRYPTION_KEY is empty, generates a temp key (dev only)."""
    monkeypatch.setenv("N8N_ENCRYPTION_KEY", "")
    from app.common.fernet_crypto import encrypt_token, decrypt_token

    plain = "test-token"
    cipher = encrypt_token(plain)
    assert decrypt_token(cipher) == plain
```

Run: `cd backend && python -m pytest tests/test_fernet_crypto.py -v`
Expected: FAIL (module not found)

- [ ] **Step 2: Implement fernet_crypto.py**

File: `backend/app/common/fernet_crypto.py`

```python
from cryptography.fernet import Fernet
from app.config import get_settings


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
```

- [ ] **Step 3: Run tests, verify pass**

Run: `cd backend && python -m pytest tests/test_fernet_crypto.py -v`
Expected: 4 PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/common/fernet_crypto.py backend/tests/test_fernet_crypto.py
git commit -m "feat: add Fernet encryption module for API key storage"
```

---

### Task 3: Add config settings and DB connection helper

**Files:**
- Modify: `backend/app/config.py`
- Create: `backend/app/common/db.py`

- [ ] **Step 1: Update config.py — add encryption key, remove global n8n settings**

Remove the global n8n settings (no shared instance in multitenant platform):

Remove:
```python
    n8n_url: str = "http://n8n-service:5678"
    n8n_public_url: str = "https://n8n.nekazari.robotika.cloud"
    n8n_api_key: str = ""
```

Add after `database_url`:
```python
    # Encryption
    n8n_encryption_key: str = ""  # Fernet key, from K8s secret
```

The `database_url` field stays (was already at line 71).

- [ ] **Step 2: Create DB connection helper**

File: `backend/app/common/db.py`

```python
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
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/config.py backend/app/common/db.py
git commit -m "feat: add database connection helper and encryption key setting"
```

---

### Task 4: Create tenant config service (PostgreSQL CRUD)

**Files:**
- Create: `backend/app/common/tenant_config_service.py`
- Create: `backend/tests/test_tenant_config.py`

- [ ] **Step 1: Write failing test**

File: `backend/tests/test_tenant_config.py`

```python
"""Unit tests for tenant config service."""

import pytest
from app.common.tenant_config_service import (
    get_tenant_config,
    upsert_tenant_config,
    mask_api_key,
)


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


def test_get_tenant_config_not_found():
    """Returns None when no config exists for tenant."""
    result = get_tenant_config("nonexistent-tenant")
    assert result is None


def test_upsert_and_get_tenant_config():
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


def test_upsert_updates_existing():
    """Upsert updates config when row already exists."""
    tenant = "test-tenant-002"
    upsert_tenant_config(tenant, {"n8n_url": "https://old.example.com"})
    upsert_tenant_config(tenant, {"n8n_url": "https://new.example.com"})

    retrieved = get_tenant_config(tenant)
    assert retrieved["n8n_url"] == "https://new.example.com"
```

Run: `cd backend && python -m pytest tests/test_tenant_config.py -v`
Expected: FAIL (module not found)

- [ ] **Step 2: Implement tenant_config_service.py**

File: `backend/app/common/tenant_config_service.py`

```python
import json
import logging
from app.common.db import get_db_connection_safe

logger = logging.getLogger(__name__)

TABLE = "admin_platform.tenant_module_config"


def mask_api_key(key: str | None) -> str | None:
    if key is None:
        return None
    if len(key) <= 4:
        return "***"
    return "****" + key[-3:]


def get_tenant_config(tenant_id: str) -> dict | None:
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
        logger.warning(f"get_tenant_config({tenant_id}): {e}")
        return None
    finally:
        conn.close()


def upsert_tenant_config(tenant_id: str, config: dict) -> bool:
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
        logger.error(f"upsert_tenant_config({tenant_id}): {e}")
        conn.rollback()
        return False
    finally:
        conn.close()
```

- [ ] **Step 3: Run tests, verify pass**

Run: `cd backend && python -m pytest tests/test_tenant_config.py -v`
Expected: 7 PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/common/tenant_config_service.py backend/tests/test_tenant_config.py
git commit -m "feat: add tenant config service with PostgreSQL CRUD"
```

---

### Task 5: Create tenant config router (API endpoints)

**Files:**
- Create: `backend/app/routers/tenant_config.py`

- [ ] **Step 1: Write the router**

File: `backend/app/routers/tenant_config.py`

```python
"""Tenant n8n configuration endpoints (TenantAdmin only)."""

import re
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.config import get_settings, Settings
from app.middleware import get_current_user, get_tenant_id, require_roles, TokenPayload
from app.common.tenant_config_service import get_tenant_config, upsert_tenant_config, mask_api_key
from app.common.fernet_crypto import encrypt_token, decrypt_token

router = APIRouter(prefix="/tenant")


# ---- Request models ----

class TenantConfigRequest(BaseModel):
    n8n_url: str = Field(..., min_length=1, max_length=512)
    n8n_api_key: str = Field(..., min_length=1, max_length=512)

    @field_validator("n8n_url")
    @classmethod
    def url_must_be_https(cls, v: str) -> str:
        v = v.strip().rstrip("/")
        if not v.startswith("https://"):
            raise ValueError("Only https:// URLs are allowed")
        if re.search(r"localhost|127\.0\.0\.1|10\.\d+\.|172\.1[6-9]\.|172\.2\d\.|192\.168\.", v):
            raise ValueError("Private IP ranges are not allowed")
        return v


class TenantConfigResponse(BaseModel):
    n8n_url: str | None = None
    n8n_api_key_masked: str | None = None
    has_config: bool = False


class TestConnectionRequest(BaseModel):
    n8n_url: str = Field(..., min_length=1, max_length=512)
    n8n_api_key: str = Field(..., min_length=1, max_length=512)


class TestConnectionResponse(BaseModel):
    ok: bool
    status_code: int | None = None
    message: str | None = None
    latency_ms: int | None = None


# ---- Endpoints ----

@router.get("/config", response_model=TenantConfigResponse)
async def get_config(
    user: TokenPayload = Depends(require_roles("TenantAdmin", "PlatformAdmin")),
    tenant_id: str = Depends(get_tenant_id),
):
    config = get_tenant_config(tenant_id)
    if not config or "n8n_url" not in config:
        return TenantConfigResponse(has_config=False)

    api_key_enc = config.get("n8n_api_key_encrypted", "")
    return TenantConfigResponse(
        n8n_url=config["n8n_url"],
        n8n_api_key_masked=mask_api_key(api_key_enc) if api_key_enc else None,
        has_config=True,
    )


@router.put("/config", response_model=TenantConfigResponse)
async def put_config(
    body: TenantConfigRequest,
    user: TokenPayload = Depends(require_roles("TenantAdmin", "PlatformAdmin")),
    tenant_id: str = Depends(get_tenant_id),
):
    encrypted_key = encrypt_token(body.n8n_api_key)

    ok = upsert_tenant_config(tenant_id, {
        "n8n_url": body.n8n_url,
        "n8n_api_key_encrypted": encrypted_key,
    })

    if not ok:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save configuration",
        )

    return TenantConfigResponse(
        n8n_url=body.n8n_url,
        n8n_api_key_masked=mask_api_key(body.n8n_api_key),
        has_config=True,
    )


@router.post("/config/test", response_model=TestConnectionResponse)
async def test_connection(
    body: TestConnectionRequest,
    user: TokenPayload = Depends(require_roles("TenantAdmin", "PlatformAdmin")),
    tenant_id: str = Depends(get_tenant_id),
):
    url = f"{body.n8n_url.rstrip('/')}/healthz"
    headers = {"X-N8N-API-KEY": body.n8n_api_key}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            start = httpx.utils.current_timestamp()
            resp = await client.get(url, headers=headers)
            latency = int((httpx.utils.current_timestamp() - start) * 1000)

            return TestConnectionResponse(
                ok=resp.status_code == 200,
                status_code=resp.status_code,
                message=f"HTTP {resp.status_code}",
                latency_ms=latency,
            )
    except httpx.TimeoutException:
        return TestConnectionResponse(ok=False, message="Connection timed out")
    except Exception as e:
        return TestConnectionResponse(ok=False, message=str(e))
```

- [ ] **Step 2: Verify syntax**

Run: `cd backend && python -c "from app.routers.tenant_config import router; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/tenant_config.py
git commit -m "feat: add tenant config API endpoints with RBAC"
```

---

### Task 6: Modify n8n router for per-tenant resolution

**Files:**
- Modify: `backend/app/routers/n8n.py`

- [ ] **Step 1: Update GET /n8n/url to resolve per tenant (no global fallback)**

Find the existing `@router.get("/url")` endpoint. Update it to read tenant config. No global fallback — a multitenant platform cannot have a shared n8n:

```python
@router.get("/url")
async def get_n8n_public_url(
    user: TokenPayload = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """Return the n8n URL for the current tenant, or null if not configured."""
    config = get_tenant_config(tenant_id)
    if config and config.get("n8n_url"):
        return {"url": config["n8n_url"]}
    return {"url": None}
```

Add the import at top:
```python
from app.common.tenant_config_service import get_tenant_config
```

- [ ] **Step 2: Update n8n_request() to use tenant credentials (no global fallback)**

Update the `n8n_request` function signature and body. If tenant hasn't configured n8n, return a clear error — no silent fallback to any global instance:

```python
async def n8n_request(
    method: str,
    path: str,
    settings: Settings,
    tenant_id: str = "",
    json_data: Optional[dict] = None,
):
    """Make authenticated request to the tenant's n8n API."""
    if not tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing tenant context")

    config = get_tenant_config(tenant_id)
    if not config or not config.get("n8n_url"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="n8n not configured for this tenant. Admin must set URL + API key in module settings.",
        )

    url = f"{config['n8n_url'].rstrip('/')}/api/v1{path}"
    api_key = ""
    if config.get("n8n_api_key_encrypted"):
        api_key = decrypt_token(config["n8n_api_key_encrypted"])

    headers = {}
    if api_key:
        headers["X-N8N-API-KEY"] = api_key

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.request(
                method=method,
                url=url,
                headers=headers,
                json=json_data,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"n8n API error: {e.response.text}"
            )
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"n8n service unavailable: {str(e)}"
            )
```

Add the import at top:
```python
from app.common.fernet_crypto import decrypt_token
```

Each route handler calling `n8n_request()` must pass `tenant_id`. Update:
`list_workflows`, `get_workflow`, `toggle_workflow`, `execute_workflow`,
`list_executions`, `get_execution`. Example:

```python
@router.get("/workflows")
async def list_workflows(
    active: Optional[bool] = None,
    user: TokenPayload = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    data = await n8n_request("GET", "/workflows", settings, tenant_id)
    # ...
```

- [ ] **Step 3: Verify syntax**

Run: `cd backend && python -c "from app.routers.n8n import router; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/n8n.py
git commit -m "feat: resolve n8n URL and API key per tenant in proxy calls"
```

---

### Task 7: Register tenant config router in main.py

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Import and register the router**

Add import:
```python
from app.routers import tenant_config
```

Add router registration after the webhooks router:
```python
app.include_router(tenant_config.router, prefix=settings.api_prefix, tags=["Tenant Config"])
```

- [ ] **Step 2: Verify app loads**

Run: `cd backend && python -c "from app.main import app; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: register tenant config router in main app"
```

---

### Task 8: K8s changes — encryption key and database URL

**Files:**
- Modify: `k8s/backend-deployment.yaml`
- Create: `k8s/secret-template.yaml`

- [ ] **Step 1: Update backend deployment env vars**

Remove the global `N8N_PUBLIC_URL` env var (no shared n8n in multitenant platform).
Remove the global `N8N_URL` and `N8N_API_KEY` env vars (no shared n8n instance).
Add the new env vars for tenant config storage:

```yaml
            # Database for tenant config storage
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: postgresql-secret
                  key: database-url
                  optional: true
            # Fernet encryption key for API key at rest
            - name: N8N_ENCRYPTION_KEY
              valueFrom:
                secretKeyRef:
                  name: n8n-nkz-secret
                  key: encryption-key
                  optional: true
```

- [ ] **Step 2: Create secret template**

File: `k8s/secret-template.yaml`

```yaml
# =============================================================================
# n8n Integration Hub Module Secret
# =============================================================================
# Create this secret before deploying the backend.
# Generate encryption key: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# =============================================================================

apiVersion: v1
kind: Secret
metadata:
  name: n8n-nkz-secret
  namespace: nekazari
  labels:
    app: n8n-nkz
    module: n8n-nkz
data:
  encryption-key: <base64-encoded-fernet-key>
```

- [ ] **Step 3: Commit**

```bash
git add k8s/backend-deployment.yaml k8s/secret-template.yaml
git commit -m "feat: add N8N_ENCRYPTION_KEY and DATABASE_URL to K8s deployment"
```

---

### Task 9: Update useN8nUrl hook — no global fallback

**Files:**
- Modify: `src/hooks/useN8nUrl.ts`

- [ ] **Step 1: Remove hostname-derived fallback, return null when no tenant config**

Replace the current hook content entirely:

```typescript
import { useEffect, useState } from 'react';
import { useAuth } from '@nekazari/sdk';
import { useModuleApi } from '@/services/api';

let cachedUrl: string | null | undefined = undefined;

export function useN8nUrl(): string | null {
  const { isAuthenticated } = useAuth();
  const api = useModuleApi();
  const [url, setUrl] = useState<string | null>(
    cachedUrl !== undefined ? cachedUrl : null
  );

  useEffect(() => {
    if (cachedUrl !== undefined) return;
    if (!isAuthenticated) return;

    api.getN8nUrl().then((fetchedUrl: string | null) => {
      cachedUrl = fetchedUrl;
      setUrl(fetchedUrl);
    }).catch(() => {
      cachedUrl = null;
      setUrl(null);
    });
  }, [isAuthenticated]);

  return url;
}
```

Key change: `getN8nUrl()` now returns `{ url: string | null }`. When `null`,
the tenant has no n8n configured → hook returns `null` → components show setup prompt.

- [ ] **Step 2: TypeScript typecheck**

Run: `node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useN8nUrl.ts
git commit -m "refactor: useN8nUrl returns null when tenant has no n8n configured"
```

---

### Task 10: Frontend — API client methods

**Files:**
- Modify: `src/services/api.ts`

- [ ] **Step 1: Add tenant config API methods**

Add to the returned object in `useModuleApi()`, in the Config section after `getN8nUrl`:

```typescript
    /** Get tenant n8n configuration (TenantAdmin only) */
    getTenantConfig: (): Promise<{
      n8n_url: string | null;
      n8n_api_key_masked: string | null;
      has_config: boolean;
    }> => client.get('/tenant/config'),

    /** Save tenant n8n configuration (TenantAdmin only) */
    saveTenantConfig: (data: { n8n_url: string; n8n_api_key: string }): Promise<{
      n8n_url: string | null;
      n8n_api_key_masked: string | null;
      has_config: boolean;
    }> => client.put('/tenant/config', data),

    /** Test n8n connection (TenantAdmin only) */
    testN8nConnection: (data: { n8n_url: string; n8n_api_key: string }): Promise<{
      ok: boolean;
      status_code: number | null;
      message: string | null;
      latency_ms: number | null;
    }> => client.post('/tenant/config/test', data),
```

- [ ] **Step 2: TypeScript typecheck**

Run: `node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/services/api.ts
git commit -m "feat: add tenant config API methods to frontend client"
```

---

### Task 11: Frontend — useTenantConfig hook

**Files:**
- Create: `src/hooks/useTenantConfig.ts`

- [ ] **Step 1: Write the hook**

File: `src/hooks/useTenantConfig.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@nekazari/sdk';
import { useModuleApi } from '@/services/api';

interface TenantConfig {
  n8n_url: string | null;
  n8n_api_key_masked: string | null;
  has_config: boolean;
}

export function useTenantConfig() {
  const { isAuthenticated, hasRole } = useAuth();
  const api = useModuleApi();

  const [config, setConfig] = useState<TenantConfig>({ n8n_url: null, n8n_api_key_masked: null, has_config: false });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string | null; latency_ms: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = hasRole('TenantAdmin') || hasRole('PlatformAdmin');

  const loadConfig = useCallback(async () => {
    if (!isAuthenticated || !isAdmin) return;
    try {
      const data = await api.getTenantConfig();
      setConfig(data);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load config');
    }
  }, [isAuthenticated, isAdmin]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const saveConfig = useCallback(async (n8n_url: string, n8n_api_key: string) => {
    setIsSaving(true);
    setError(null);
    try {
      const data = await api.saveTenantConfig({ n8n_url, n8n_api_key });
      setConfig(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to save config');
      throw e;
    } finally {
      setIsSaving(false);
    }
  }, [api]);

  const testConnection = useCallback(async (n8n_url: string, n8n_api_key: string) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await api.testN8nConnection({ n8n_url, n8n_api_key });
      setTestResult(result);
      return result;
    } catch (e: any) {
      const msg = e?.message || 'Test failed';
      setTestResult({ ok: false, message: msg, latency_ms: null });
    } finally {
      setIsTesting(false);
    }
  }, [api]);

  return {
    config,
    saveConfig,
    testConnection,
    testResult,
    isSaving,
    isTesting,
    error,
    isAdmin,
  };
}
```

- [ ] **Step 2: TypeScript typecheck**

Run: `node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTenantConfig.ts
git commit -m "feat: add useTenantConfig hook for settings panel"
```

---

### Task 12: Frontend — i18n keys

**Files:**
- Modify: `src/locales/es.json`
- Modify: `src/locales/en.json`

- [ ] **Step 1: Add i18n keys to es.json**

Add after the existing `integrations` block:

```json
  "settings": {
    "title": "Configuracion n8n",
    "subtitle": "Conecta tu propia instancia de n8n",
    "urlLabel": "URL de n8n",
    "apiKeyLabel": "API Key",
    "testButton": "Probar conexion",
    "saveButton": "Guardar",
    "showKey": "Mostrar",
    "hideKey": "Ocultar",
    "testSuccess": "Conexion OK",
    "testFailure": "Error de conexion",
    "saveSuccess": "Configuracion guardada",
    "saveFailure": "Error al guardar",
    "notConfigured": "Configura tu instancia n8n para empezar",
    "expand": "Configuracion n8n (solo admin)",
    "noAdminAccess": "Solo administradores del tenant pueden configurar n8n",
    "urlPlaceholder": "https://n8n.mi-empresa.com",
    "apiKeyPlaceholder": "n8n_api_..."
  }
```

- [ ] **Step 2: Add i18n keys to en.json**

```json
  "settings": {
    "title": "n8n Configuration",
    "subtitle": "Connect your own n8n instance",
    "urlLabel": "n8n URL",
    "apiKeyLabel": "API Key",
    "testButton": "Test connection",
    "saveButton": "Save",
    "showKey": "Show",
    "hideKey": "Hide",
    "testSuccess": "Connection OK",
    "testFailure": "Connection failed",
    "saveSuccess": "Configuration saved",
    "saveFailure": "Failed to save",
    "notConfigured": "Configure your n8n instance to get started",
    "expand": "n8n Configuration (admin only)",
    "noAdminAccess": "Only tenant administrators can configure n8n",
    "urlPlaceholder": "https://n8n.my-company.com",
    "apiKeyPlaceholder": "n8n_api_..."
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/locales/es.json src/locales/en.json
git commit -m "feat: add i18n keys for n8n settings panel"
```

---

### Task 13: Frontend — Settings panel in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add settings panel component**

Add the import at top:
```typescript
import { useTenantConfig } from './hooks/useTenantConfig';
```

Add destructure inside `ModuleApp`:
```typescript
  const { config, saveConfig, testConnection, testResult, isSaving, isTesting, error, isAdmin } = useTenantConfig();
```

Add state for panel visibility and form fields:
```typescript
  const [settingsOpen, setSettingsOpen] = useState(!config.has_config);
  const [formUrl, setFormUrl] = useState(config.n8n_url || '');
  const [formKey, setFormKey] = useState('');
  const [showKey, setShowKey] = useState(false);
```

Add the collapsible panel right after the header `<div>` closes, before the Main Content section:

```tsx
      {/* Settings Panel (TenantAdmin only) */}
      {isAdmin && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className="bg-white rounded-lg shadow border border-orange-200">
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-orange-50 rounded-t-lg"
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-medium text-gray-700">{t('settings.expand')}</span>
              </div>
              <span className="text-gray-400 text-xs">{settingsOpen ? '▲' : '▼'}</span>
            </button>

            {settingsOpen && (
              <div className="px-4 pb-4 border-t border-orange-100 pt-4 space-y-3">
                <p className="text-xs text-gray-500">{t('settings.subtitle')}</p>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('settings.urlLabel')}</label>
                  <input
                    type="url"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder={t('settings.urlPlaceholder')}
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('settings.apiKeyLabel')}</label>
                  <div className="flex gap-2">
                    <input
                      type={showKey ? 'text' : 'password'}
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder={t('settings.apiKeyPlaceholder')}
                      value={formKey}
                      onChange={(e) => setFormKey(e.target.value)}
                    />
                    <button
                      onClick={() => setShowKey(!showKey)}
                      className="px-3 py-2 text-xs text-gray-500 hover:bg-gray-100 rounded-lg"
                    >
                      {showKey ? t('settings.hideKey') : t('settings.showKey')}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      await testConnection(formUrl, formKey);
                    }}
                    disabled={isTesting || !formUrl || !formKey}
                    className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
                  >
                    {isTesting ? '...' : t('settings.testButton')}
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await saveConfig(formUrl, formKey);
                      } catch {}
                    }}
                    disabled={isSaving || !formUrl || !formKey}
                    className="px-4 py-2 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded-lg disabled:opacity-50"
                  >
                    {isSaving ? '...' : t('settings.saveButton')}
                  </button>
                </div>

                {testResult && (
                  <div className={`text-xs px-3 py-2 rounded-lg ${testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {testResult.ok
                      ? `${t('settings.testSuccess')} (${testResult.latency_ms}ms)`
                      : `${t('settings.testFailure')}: ${testResult.message || ''}`}
                  </div>
                )}

                {error && (
                  <div className="text-xs px-3 py-2 rounded-lg bg-red-50 text-red-700">{error}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 2: Replace button logic — no global n8n**

Replace the "Abrir n8n" button in the header. Three states:
- **Admin** → button opens settings panel
- **Non-admin, config exists** → button links to tenant's n8n
- **Non-admin, no config** → muted message

```tsx
              {isAdmin ? (
                <button
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  {t('settings.expand')}
                </button>
              ) : n8nUrl ? (
                <a
                  href={n8nUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  {t('app.openN8n')}
                </a>
              ) : (
                <span className="text-xs text-gray-400">{t('settings.notConfigured')}</span>
              )}
```

Also update the info banner at the bottom — remove the old static n8n URL link, replace with config-aware content:

```tsx
              {n8nUrl ? (
                <p className="text-xs text-blue-600 mt-2">
                  Access the full n8n interface at{' '}
                  <a href={n8nUrl} className="underline" target="_blank" rel="noopener">
                    {n8nUrl.replace('https://', '')}
                  </a>
                </p>
              ) : (
                <p className="text-xs text-blue-600 mt-2">
                  {t('settings.notConfigured')}
                </p>
              )}
```

- [ ] **Step 3: TypeScript typecheck**

Run: `node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add per-tenant n8n settings panel to module page"
```

---

### Task 14: Build, deploy, verify

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && python -m pytest tests/ -v
```
Expected: all tests pass

- [ ] **Step 2: Build IIFE bundle**

```bash
pnpm run build:module
```
Expected: builds successfully

- [ ] **Step 3: Commit and push**

```bash
git add -A
git commit -m "feat: per-tenant n8n configuration — Phase 1 complete"
git push origin main
```

- [ ] **Step 4: Deploy backend (after CI builds)**

```bash
# Wait for CI to build and push new backend image
# Then rollout restart:
ssh g@109.123.252.120 "sudo kubectl rollout restart deployment/n8n-nkz-backend -n nekazari"
```

- [ ] **Step 5: Create K8s secret for encryption key**

```bash
ENCRYPTION_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
ssh g@109.123.252.120 "sudo kubectl create secret generic n8n-nkz-secret -n nekazari --from-literal=encryption-key=${ENCRYPTION_KEY} --dry-run=client -o yaml | sudo kubectl apply -f -"
```

- [ ] **Step 6: Apply updated backend deployment**

```bash
scp k8s/backend-deployment.yaml g@109.123.252.120:/tmp/n8n-nkz-backend-deployment.yaml
ssh g@109.123.252.120 "sudo kubectl apply -f /tmp/n8n-nkz-backend-deployment.yaml"
```

- [ ] **Step 7: Run migration on PostgreSQL**

```bash
scp backend/migrations/001_tenant_module_config.sql g@109.123.252.120:/tmp/
ssh g@109.123.252.120 "sudo kubectl exec deploy/postgresql -n nekazari -- psql -U postgres -d nekazari -f /tmp/001_tenant_module_config.sql"
```

Expected: `CREATE TABLE`

- [ ] **Step 8: Upload IIFE bundle to MinIO**

```bash
scp dist/nkz-module.js g@109.123.252.120:/tmp/
ssh g@109.123.252.120 "sudo mc cp /tmp/nkz-module.js minio/nekazari-frontend/modules/n8n-nkz/nkz-module.js"
```

- [ ] **Step 9: Verify endpoint**

```bash
# Auth required — should return per-tenant config or global fallback
curl -s https://nkz.robotika.cloud/api/n8n-nkz/n8n/url
# Expected: {"detail":"Missing authorization token"} (routing works)
```
```

---

## Implementation Order

1. Task 1 → DB migration + dependencies
2. Task 2 → Fernet encryption (can be parallel with Task 1)
3. Task 3 → Config settings (remove globals) + DB helper (after Task 1)
4. Task 4 → Tenant config service (after Tasks 2, 3)
5. Task 5 → Tenant config router (after Task 4)
6. Task 6 → n8n router per-tenant resolution (after Task 4)
7. Task 7 → Register router in main.py (after Task 5)
8. Task 8 → K8s changes (after Task 3)
9. Task 9 → useN8nUrl hook (no global fallback)
10. Task 10 → Frontend API client (can be parallel with 5-8)
11. Task 11 → useTenantConfig hook (after Task 10)
12. Task 12 → i18n keys (can be parallel with 10-11)
13. Task 13 → App.tsx settings panel (after Tasks 9, 11, 12)
14. Task 14 → Build, deploy, verify (after all)

## Dependencies

- `cryptography` added to `requirements.txt` (already available via `python-jose[cryptography]` transitive dep)
- `psycopg2-binary` added to `requirements.txt`
- `DATABASE_URL` must point to the platform PostgreSQL (shared with other services)
- `N8N_ENCRYPTION_KEY` K8s secret must exist before backend pod starts
- Entity-manager or admin must run the migration SQL before the backend reads the table
