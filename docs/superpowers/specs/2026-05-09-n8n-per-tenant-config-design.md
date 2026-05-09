---
title: "Per-Tenant External n8n Configuration — Design Spec"
date: 2026-05-09
status: approved
repo: nkz-os/n8n-module-nkz
---

## Summary

Each tenant can bring their own n8n instance (URL + API key). The module
resolves the n8n URL per tenant from PostgreSQL. TenantAdmins configure
their instance via a settings panel in the module page. API key is stored
encrypted at rest (Fernet).

This is Phase 1 — tenant brings their own n8n. Phase 2 will auto-provision
n8n instances on the platform.

## Architecture

```
┌──────────────────────────────────────────────────┐
│ Frontend (IIFE bundle, App.tsx)                  │
│                                                  │
│  ┌──────────────────┐  useN8nUrl()               │
│  │ Settings Panel    │  ──────────────┐           │
│  │ (TenantAdmin)     │                │           │
│  │  - n8n URL        │  ┌─────────────▼─────────┐│
│  │  - n8n API Key    │  │ GET /n8n/url          ││
│  │  - Test / Save    │──│ tenant context via JWT││
│  └──────────────────┘  └───────────┬───────────┘│
│                                    │             │
└────────────────────────────────────┼─────────────┘
                                     │
┌────────────────────────────────────▼─────────────┐
│ Backend (FastAPI, routers/n8n.py)                │
│                                                   │
│  GET  /n8n/url         → tenant URL or global     │
│  GET  /tenant/config    → masked config (admin)    │
│  PUT  /tenant/config    → validate + encrypt +     │
│                           upsert PostgreSQL       │
│                                                   │
│  ┌─────────────────────┐                         │
│  │ Fernet encryption    │                         │
│  │ N8N_ENCRYPTION_KEY   │                         │
│  └──────────┬──────────┘                         │
│             │                                     │
│  ┌──────────▼──────────┐                         │
│  │ admin_platform.      │                         │
│  │ tenant_module_config │                         │
│  └─────────────────────┘                         │
└──────────────────────────────────────────────────┘
```

## Database

### Migration: `admin_platform.tenant_module_config`

```sql
CREATE TABLE IF NOT EXISTS admin_platform.tenant_module_config (
    tenant_id   TEXT NOT NULL,
    module_id   TEXT NOT NULL DEFAULT 'n8n-nkz',
    config      JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (tenant_id, module_id)
);
```

`config` JSONB shape:
```json
{
  "n8n_url": "https://n8n.acme.com",
  "n8n_api_key_encrypted": "<fernet-ciphertext>"
}
```

JSONB chosen over fixed columns to allow future keys without migration.

### Migration file

`backend/migrations/001_tenant_module_config.sql` — applied by entity-manager
on module activation, following the same pattern as `tenant_limits`.

## Backend

### New file: `backend/app/common/fernet_crypto.py`

```python
from cryptography.fernet import Fernet
from app.config import get_settings

def get_fernet() -> Fernet:
    key = get_settings().n8n_encryption_key
    return Fernet(key.encode() if key else Fernet.generate_key())

def encrypt_token(plain: str) -> str:
    return get_fernet().encrypt(plain.encode()).decode()

def decrypt_token(cipher: str) -> str:
    return get_fernet().decrypt(cipher.encode()).decode()
```

### New file: `backend/app/common/tenant_config_service.py`

- `get_tenant_config(tenant_id: str) → dict | None` — read from PostgreSQL
- `upsert_tenant_config(tenant_id: str, config: dict) → bool` — write
- Uses `db_helper` pattern from entity-manager (psycopg2, connection pool, no ORM)

### Modified: `backend/app/config.py`

Add:
```python
n8n_encryption_key: str = ""  # Fernet key, from K8s secret
```

### New: `backend/app/routers/tenant_config.py`

Endpoints (all under `/api/n8n-nkz/tenant`):

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/config` | TenantAdmin+ | Returns `{ n8n_url, n8n_api_key_masked, has_config }` |
| PUT | `/config` | TenantAdmin+ | Body: `{ n8n_url, n8n_api_key }`. Validates URL, encrypts key, upserts |
| POST | `/config/test` | TenantAdmin+ | Body: `{ n8n_url, n8n_api_key }`. Probes `{url}/healthz`, returns `{ ok, status, latency_ms }` |

### Modified: `backend/app/routers/n8n.py`

The existing `GET /n8n/url` endpoint now reads tenant config first:
```
tenant_config → n8n_url found  → return it
tenant_config → not found      → return settings.n8n_public_url (global fallback)
```

### Modified: `backend/app/routers/n8n.py` — proxy calls use tenant credentials

The `n8n_request()` helper currently uses global `settings.n8n_url` and
`settings.n8n_api_key`. After this change, it resolves per tenant:

```python
async def n8n_request(method, path, settings, tenant_id, json_data=None):
    config = get_tenant_config(tenant_id)
    url = (config["n8n_url"] if config else settings.n8n_url)
    api_key = decrypt_token(config["n8n_api_key_encrypted"]) if config else settings.n8n_api_key
    # ... use url + api_key for the n8n API call
```

All existing n8n proxy routes (`GET /workflows`, `GET /executions`, etc.) pass
`tenant_id` from `Depends(get_tenant_id)` to `n8n_request()`.

### Modified: `backend/app/main.py`

Register `tenant_config.router` with prefix `/api/n8n-nkz/tenant`.

## Frontend

### New: `src/hooks/useTenantConfig.ts`

Hook for the config panel. Returns:
- `config` — current `{ n8n_url, n8n_api_key_masked, has_config }`
- `saveConfig(url, key)` — calls `PUT /tenant/config`
- `testConnection(url, key)` — calls `POST /tenant/config/test`
- `isSaving`, `isTesting` — loading states
- `error` — last error message

### Modified: `src/hooks/useN8nUrl.ts`

No changes needed — already calls `GET /n8n/url` which resolves per tenant.

### Modified: `src/services/api.ts`

Add `getTenantConfig()`, `saveTenantConfig()`, `testN8nConnection()` methods.

### Modified: `src/App.tsx`

Add collapsible settings panel, only rendered for TenantAdmin/PlatformAdmin:

```
┌─────────────────────────────────────────────────┐
│ ⚙️ Configuración n8n (solo admin)    [expandir] │
├─────────────────────────────────────────────────┤
│ URL de n8n: [https://n8n.mi-empresa.com    ]    │
│ API Key:    [••••••••••••••••••] [mostrar]      │
│ [Probar conexión]  [Guardar]                     │
│                                                   │
│ ✅ Conexión OK — n8n v1.72.0 (45ms)              │
└─────────────────────────────────────────────────┘
```

When no config exists, show a banner prompting setup instead of the "Abrir n8n" button.

### Modified: `src/locales/es.json` and `src/locales/en.json`

Add keys under namespace `n8n`:
- `settings.title`, `settings.urlLabel`, `settings.apiKeyLabel`
- `settings.testButton`, `settings.saveButton`, `settings.showKey`, `settings.hideKey`
- `settings.testSuccess`, `settings.testFailure`, `settings.saveSuccess`, `settings.saveFailure`
- `settings.notConfigured`

## Security

- **Encryption key**: `N8N_ENCRYPTION_KEY` env var, injected via K8s secret into backend deployment
- **At rest**: API key stored as Fernet ciphertext in PostgreSQL JSONB
- **In transit**: HTTPS only, JWT auth required for all config endpoints
- **In memory**: API key decrypted only when calling n8n API, never logged
- **RBAC**: `require_roles("TenantAdmin", "PlatformAdmin")` on config write endpoints
- **URL validation**: Only `https://` scheme allowed. Reject localhost/private IPs in production.
- **Masked exposure**: `GET /config` returns `n8n_api_key_masked: "****abc"` (last 4 chars only)

## K8s Changes

### `backend-deployment.yaml`

Add:
```yaml
- name: N8N_ENCRYPTION_KEY
  valueFrom:
    secretKeyRef:
      name: n8n-nkz-secret
      key: encryption-key
      optional: false
```

### New secret template: `k8s/secret-template.yaml`

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: n8n-nkz-secret
  namespace: nekazari
data:
  encryption-key: <base64-fernet-key>
```

## Testing

- Backend: unit tests for Fernet round-trip, tenant config CRUD, URL validation
- Frontend: TypeScript typecheck covers API client types
- Integration: `PUT /config` → `GET /n8n/url` returns tenant URL; without config → returns global fallback

## Scope & Non-Goals

**In scope:**
- Per-tenant n8n URL + API key storage
- Fernet encryption at rest
- Config panel for TenantAdmin
- Test connection before save
- Backward compatible (tenants without config use global n8n)

**Out of scope (Phase 2):**
- Auto-provisioning n8n instances per tenant
- Per-tenant n8n subdomain/ingress
- n8n credential isolation
