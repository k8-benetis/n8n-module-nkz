---
title: "n8n Auto-Provisioning per Tenant (Phase 2) — Design Spec"
date: 2026-05-10
status: approved
repo: nkz-os/n8n-module-nkz
---

## Summary

Each tenant gets their own isolated n8n instance. Enterprise tenants get it
included in their plan. Non-enterprise tenants can purchase it as a Stripe
addon (29€/month). Provisioning is automatic via K8s Python client. Grace
period of 30 days on cancel/unpaid before data is purged.

The existing shared n8n instance (`n8n.nekazari.robotika.cloud`) remains
available exclusively for PlatformAdmin as an internal automation tool.
Tenant instances are completely separate.

## Architecture

```
┌──────────────────────────────────────────────────┐
│ Frontend (App.tsx)                                │
│                                                   │
│  Panel de n8n (admin):                            │
│  ┌─────────────────────────────────────────────┐ │
│  │ none → "Activar n8n"                        │ │
│  │   enterprise → provisiona directo            │ │
│  │   no enterprise → Stripe Checkout (29€/mes)  │ │
│  │                                              │ │
│  │ active → URL, creds, "Abrir n8n"            │ │
│  │ suspended → "Reactiva suscripción"           │ │
│  │ grace_period → "X días hasta borrado"        │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────┬───────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────┐
│ Backend (n8n-nkz)                                 │
│                                                   │
│  POST   /tenant/provision          → crear        │
│  DELETE /tenant/provision          → cancelar     │
│  GET    /tenant/provision/status   → estado       │
│                                                   │
│  n8n_provisioner.py                               │
│  ┌─────────────────────────────────────────────┐ │
│  │ • kubernetes client aplica templates K8s     │ │
│  │ • Genera credenciales aleatorias             │ │
│  │ • Crea DB n8n_{tenant_id} en PostgreSQL      │ │
│  │ • Guarda URL + creds en tenant_module_config │ │
│  │ • Crea subdominio ingress                    │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  n8n_suspension_manager.py                        │
│  ┌─────────────────────────────────────────────┐ │
│  │ • Escala deployment a 0 (suspender)          │ │
│  │ • Restaura (reactivar)                       │ │
│  │ • Borrado completo tras grace period         │ │
│  │ • APScheduler: check diario                  │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────┬───────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────┐
│ Stripe                                            │
│                                                   │
│  Product: "n8n Instance" (29€/mes)                │
│  Webhook → tenant-webhook → n8n-nkz backend       │
│  ┌─────────────────────────────────────────────┐ │
│  │ checkout.session.completed → provision       │ │
│  │ invoice.paid              → reactivar        │ │
│  │ invoice.payment_failed    → suspender        │ │
│  │ subscription.deleted      → grace period     │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────┬───────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────┐
│ K8s (por tenant, namespace nekazari)              │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │ Deployment: n8n-{tenant-id}                  │ │
│  │   image: n8nio/n8n:latest                    │ │
│  │   requests: 256Mi/100m, limits: 1Gi/500m     │ │
│  │   HPA: min 1, max 3, target 70% CPU          │ │
│  │                                              │ │
│  │ Service:   n8n-{tenant-id}-service           │ │
│  │ PVC:       n8n-workflows-{tenant-id} (10Gi)  │ │
│  │ Secret:    n8n-{tenant-id}-secret            │ │
│  │ Ingress:   n8n-{tenant-id}.nekazari.r.c      │ │
│  │ Postgres:  n8n_{tenant_id} database          │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

## Stripe Integration

### Product

- Name: "n8n Instance"
- Price: 29€/month (configurable via `N8N_ADDON_PRICE_EUR` env var)
- Metadata: `module_id: n8n-nkz`
- Not a plan — an addon. Tenant keeps their current plan + adds n8n.

### Checkout Flow

1. TenantAdmin clicks "Activar n8n" in module page
2. Backend creates Stripe Checkout Session with `tenant_id` in metadata,
   success URL `{FRONTEND_URL}/n8n-hub?provisioning=complete`,
   cancel URL `{FRONTEND_URL}/n8n-hub?provisioning=cancelled`
3. Frontend redirects to Stripe Checkout URL
4. Tenant completes payment → redirected back to module page
5. Webhook `checkout.session.completed` arrives at tenant-webhook
6. tenant-webhook calls `POST /internal/n8n/provision` on n8n-nkz backend
7. Backend provisions K8s resources + DB + saves config

### Webhooks

tenant-webhook already has `_verify_internal_billing_secret()` for internal auth.
New internal endpoints on n8n-nkz backend:

| Internal Endpoint | Called By | Action |
|-------------------|-----------|--------|
| `POST /internal/n8n/provision` | tenant-webhook | Provision instance |
| `POST /internal/n8n/suspension-event` | tenant-webhook | Suspend/reactivate/purge |

tenant-webhook routes Stripe events:

| Stripe Event | Internal Call |
|--------------|---------------|
| `checkout.session.completed` | `POST /internal/n8n/provision` |
| `invoice.paid` | `POST /internal/n8n/suspension-event { event: "reactivate" }` |
| `invoice.payment_failed` | `POST /internal/n8n/suspension-event { event: "suspend" }` |
| `subscription.deleted` | `POST /internal/n8n/suspension-event { event: "grace_period" }` |

### Enterprise (no Stripe)

When tenant `plan_level >= ENTERPRISE`:
1. Backend provisions directly — no Stripe session created
2. `stripe_subscription_id` remains `null` in `tenant_module_config`
3. Instance stays active as long as tenant plan is enterprise
4. If tenant downgrades from enterprise → instance enters grace period
   (tenant must purchase addon to keep it)

## K8s Provisioning

### Templates

Uses `kubernetes` Python client (`kubernetes>=30.0.0`). All resources in
`nekazari` namespace with labels `module: n8n-nkz`, `tenant: {tenant_id}`.

**Resources per tenant:**
- `Deployment`: `n8n-{tenant_id}`
- `Service`: `n8n-{tenant_id}-service` (ClusterIP, port 5678)
- `PVC`: `n8n-workflows-{tenant_id}` (10Gi, ReadWriteOnce)
- `Secret`: `n8n-{tenant_id}-secret` (basic auth user/pass, API key — autogenerated)
- `Ingress`: host `n8n-{tenant_id}.nekazari.robotika.cloud` → service
- `HPA`: `n8n-{tenant-id}-hpa` (min 1, max 3, CPU 70%)

**Database:** Separate PostgreSQL database `n8n_{tenant_id}` created on
provision, dropped on purge. n8n uses its own internal schemas per DB.

### Credential Generation

```python
import secrets

username = f"admin_{secrets.token_hex(4)}"
password = secrets.token_urlsafe(16)
api_key = secrets.token_urlsafe(24)
```

Stored in:
1. K8s Secret `n8n-{tenant_id}-secret` (for n8n deployment env vars)
2. `tenant_module_config` JSONB (encrypted with Fernet, for backend API calls)

### ServiceAccount

The backend needs a K8s ServiceAccount with RBAC:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: n8n-provisioner
  namespace: nekazari
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: n8n-provisioner-role
  namespace: nekazari
rules:
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["create", "get", "list", "update", "patch", "delete"]
- apiGroups: [""]
  resources: ["services", "persistentvolumeclaims", "secrets"]
  verbs: ["create", "get", "list", "update", "delete"]
- apiGroups: ["networking.k8s.io"]
  resources: ["ingresses"]
  verbs: ["create", "get", "list", "update", "delete"]
- apiGroups: ["autoscaling"]
  resources: ["horizontalpodautoscalers"]
  verbs: ["create", "get", "list", "update", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: n8n-provisioner-binding
  namespace: nekazari
subjects:
- kind: ServiceAccount
  name: n8n-provisioner
  namespace: nekazari
roleRef:
  kind: Role
  name: n8n-provisioner-role
  apiGroup: rbac.authorization.k8s.io
```

### Naming Convention

Tenant IDs are sanitized for K8s compatibility: lowercase, replace `_` with `-`,
truncate to 63 chars for label values, 253 for resource names.

| Resource | Pattern |
|----------|---------|
| Deployment | `n8n-{tenant_id}` |
| Service | `n8n-{tenant_id}-service` |
| PVC | `n8n-workflows-{tenant_id}` |
| Secret | `n8n-{tenant_id}-secret` |
| Ingress | `n8n-{tenant_id}-ingress` |
| HPA | `n8n-{tenant_id}-hpa` |
| DB | `n8n_{tenant_id}` (underscore, PostgreSQL identifier) |
| Host | `n8n-{tenant_id}.nekazari.robotika.cloud` |

Grace period duration: configurable via `N8N_GRACE_PERIOD_DAYS` env var (default 30).

## Backend

### New Dependencies

`backend/requirements.txt` additions:
```
kubernetes>=30.0.0
APScheduler>=3.10.0
stripe>=9.0.0
```

### New Files

| File | Purpose |
|------|---------|
| `backend/app/common/n8n_provisioner.py` | K8s resource lifecycle (create/suspend/purge) |
| `backend/app/common/n8n_suspension_manager.py` | Grace period checker (APScheduler), event handler |
| `backend/app/routers/internal_n8n.py` | Internal endpoints for tenant-webhook |

### New/Modified Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/tenant/provision` | TenantAdmin+ | Start provisioning. Returns Stripe URL or `{ status: "provisioning" }` for enterprise |
| `DELETE` | `/tenant/provision` | TenantAdmin+ | Cancel subscription. If addon: cancel Stripe sub. If enterprise: start grace period |
| `GET` | `/tenant/provision/status` | Autenticado | Returns `{ status, url, username, suspended_at, expires_at }` |
| `POST` | `/internal/n8n/provision` | Internal (secret) | Called by tenant-webhook. Provision instance |
| `POST` | `/internal/n8n/suspension-event` | Internal (secret) | Called by tenant-webhook. `{ tenant_id, event: "suspend"|"reactivate"|"grace_period" }` |

### Status Model

```
none ──[provision]──▶ in_progress ──[k8s ready]──▶ active

active ──[invoice.payment_failed]──▶ suspended
suspended ──[invoice.paid]──▶ active

active ──[subscription.deleted]──▶ grace_period
suspended ──[subscription.deleted]──▶ grace_period

grace_period ──[invoice.paid / plan restore]──▶ active
grace_period ──[30d elapsed]──▶ purged (K8s resources + DB + config deleted)
```

### `tenant_module_config` additions

Existing JSONB config adds:
```json
{
  "n8n_url": "https://n8n-acme.example.com",
  "n8n_api_key_encrypted": "<fernet>",
  "provisioning_status": "active",
  "provisioned_at": "2026-05-15T10:00:00Z",
  "suspended_at": null,
  "stripe_subscription_id": "sub_xxx",
  "n8n_admin_username": "admin_a1b2c3d4",
  "n8n_admin_password_encrypted": "<fernet>",
  "n8n_db_name": "n8n_acme"
}
```

### `n8n_suspension_manager.py`

APScheduler job running every 24h:

```python
def check_grace_periods():
    """Find tenants in grace_period where 30 days have elapsed, purge them."""
    for config in all_configs_with_status("grace_period"):
        if config["suspended_at"] + timedelta(days=30) < now():
            purge_tenant(config["tenant_id"])
            notify_tenant_admin(config["tenant_id"], "n8n instance purged")
```

## Frontend

### `useTenantConfig` hook additions

Adds `provisionStatus` to the returned state:
- `status: "none" | "in_progress" | "active" | "suspended" | "grace_period" | "error"`
- `n8nUrl: string | null` — the tenant's n8n URL when active
- `credentials: { username, password } | null` — shown once after provisioning
- `suspendedAt: string | null` — for grace period countdown
- `isEnterprise: boolean` — whether Stripe checkout is needed
- `provision()` — triggers POST /tenant/provision
- `cancelSubscription()` — triggers DELETE /tenant/provision

### `App.tsx` — Provisioning Panel States

**`none`:**
```
┌─────────────────────────────────────────┐
│ 🔧 n8n Instance                         │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ [Activar n8n]                       │ │
│ │ Si no eres enterprise: $29/mes      │ │
│ │ Si eres enterprise: Incluido        │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**`in_progress`:**
```
┌─────────────────────────────────────────┐
│ ⏳ Provisioning...                       │
│ Creando tu instancia n8n (1-2 min)      │
│ [spinner]                                │
└─────────────────────────────────────────┘
```

**`active`:**
```
┌─────────────────────────────────────────┐
│ ✅ n8n activo                            │
│ URL: https://n8n-acme.nekazari.r.c      │
│ Usuario: admin_a1b2c3d4                 │
│ Contraseña: [mostrar]                    │
│                                         │
│ [Abrir n8n]  [Cancelar suscripción]     │
└─────────────────────────────────────────┘
```

**`suspended`:**
```
┌─────────────────────────────────────────┐
│ ⚠️ Instancia suspendida                  │
│ Por impago. Reactiva tu suscripción     │
│ para restaurarla.                        │
│                                         │
│ [Gestionar suscripción]                 │
└─────────────────────────────────────────┘
```

**`grace_period`:**
```
┌─────────────────────────────────────────┐
│ ⛔ Instancia pendiente de eliminación    │
│ Se eliminará en X días.                 │
│ Reactiva antes del {fecha} para         │
│ conservar tus workflows.                │
│                                         │
│ [Reactivar suscripción]                 │
└─────────────────────────────────────────┘
```

### i18n keys (es + en)

Add `provision.*` block to `settings`:
- `activateButton`, `activateEnterprise`, `activatePaid`
- `provisioningStatus`, `activeStatus`, `suspendedStatus`, `gracePeriodStatus`
- `urlLabel`, `usernameLabel`, `passwordLabel`, `showCredentials`
- `openN8n`, `cancelSubscription`, `manageSubscription`, `reactivateSubscription`
- `daysUntilPurge`, `errorStatus`

## Security

- **K8s RBAC:** ServiceAccount `n8n-provisioner` with limited verbs (no pod exec, no namespace create, no cluster-admin)
- **Internal endpoints:** `_verify_internal_billing_secret()` same pattern as existing `internal_update_tenant_license`
- **Credentials:** Autogenerated with `secrets.token_urlsafe()`. Stored encrypted (Fernet) in JSONB + as K8s Secret
- **DB isolation:** Each tenant gets separate PostgreSQL database. n8n internal schemas don't leak between tenants
- **NetworkPolicy (optional):** n8n pods can only egress to `postgresql-service` and ingress controller. No cross-tenant communication
- **Stripe API key:** `STRIPE_SECRET_KEY` env var in backend deployment (from K8s secret). Never logged

## Existing Shared n8n Instance

- The `n8n-service` / `n8n.nekazari.robotika.cloud` instance remains untouched
- Access restricted to PlatformAdmin via Keycloak role check on the ingress
  (OAuth2 proxy already configured in `n8n-deployment-with-oauth2.yaml`)
- Not used by the module — not a fallback, not a default
- Platform team uses it for internal automation workflows

## Scope

**In scope:**
- Auto-provisioning K8s resources per tenant via Python K8s client
- Stripe Checkout integration for paid addon
- Enterprise tenants: included, no Stripe
- Grace period 30 days on cancel/unpaid/downgrade
- Suspension/reactivation from Stripe events
- Provisioning status panel in frontend (6 states)
- Autogenerated credentials per tenant instance
- Per-tenant PostgreSQL database
- Internal endpoints secured with billing secret
- APScheduler daily grace period check

**Out of scope:**
- Modifying or removing the existing shared n8n instance
- Backup/restore of tenant workflows
- Custom domains for tenant n8n
- Usage-based billing (per workflow execution)
- Multi-replica n8n with leader election (n8n limitation)
