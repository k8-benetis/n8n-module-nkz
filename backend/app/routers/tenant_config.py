"""Tenant n8n configuration endpoints (TenantAdmin only)."""

import re
import time
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.config import get_settings, Settings
from app.middleware import get_current_user, get_tenant_id, require_roles, TokenPayload
from app.common.tenant_config_service import get_tenant_config, upsert_tenant_config, mask_api_key
from app.common.fernet_crypto import encrypt_token, decrypt_token
import stripe

logger = logging.getLogger(__name__)
from app.common.n8n_provisioner import provision_n8n_tenant
from app.common.n8n_suspension_manager import handle_suspension_event

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


class ProvisionResponse(BaseModel):
    status: str  # "in_progress" | "checkout_redirect"
    checkout_url: str | None = None
    message: str | None = None


class ProvisionStatusResponse(BaseModel):
    status: str  # "none" | "in_progress" | "active" | "suspended" | "grace_period" | "error"
    n8n_url: str | None = None
    username: str | None = None
    password: str | None = None
    suspended_at: str | None = None
    days_remaining: int | None = None
    is_enterprise: bool = False


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
            start = time.time()
            resp = await client.get(url, headers=headers)
            latency = int((time.time() - start) * 1000)

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


@router.post("/provision", response_model=ProvisionResponse)
async def start_provision(
    user: TokenPayload = Depends(require_roles("TenantAdmin", "PlatformAdmin")),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """Start n8n provisioning. Enterprise/direct -> provision. Others -> Stripe Checkout."""
    config = get_tenant_config(tenant_id)

    # Check if already provisioned
    current_status = (config or {}).get("provisioning_status", "none")
    if current_status in ("active", "in_progress"):
        return ProvisionResponse(status=current_status, message="n8n instance already provisioned or in progress")

    # Determine if enterprise (free) or needs Stripe
    is_enterprise = False
    try:
        from app.common.db import get_db_connection_safe
        conn = get_db_connection_safe()
        if conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT plan_type FROM admin_platform.tenant_limits WHERE tenant_id = %s",
                (tenant_id,),
            )
            row = cur.fetchone()
            cur.close()
            conn.close()
            if row and row[0] in ("enterprise",):
                is_enterprise = True
    except Exception:
        pass

    # PlatformAdmin always gets direct provisioning
    if is_enterprise or user.has_role("PlatformAdmin"):
        try:
            result = provision_n8n_tenant(tenant_id)
            return ProvisionResponse(
                status="in_progress",
                message=f"Provisioning started. URL: {result['url']}"
            )
        except Exception as e:
            logger.exception(f"Provisioning failed for tenant {tenant_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Provisioning failed: {str(e)}",
            )

    # Non-enterprise: create Stripe Checkout Session
    if not settings.stripe_secret_key or not settings.n8n_addon_price_id:
        logger.warning(f"Stripe not configured for tenant {tenant_id} (not enterprise, not PlatformAdmin)")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Stripe not configured. Contact platform admin.",
        )

    try:
        stripe.api_key = settings.stripe_secret_key

        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price": settings.n8n_addon_price_id,
                "quantity": 1,
            }],
            mode="subscription",
            success_url=f"{settings.frontend_url}/n8n-hub?provisioning=complete",
            cancel_url=f"{settings.frontend_url}/n8n-hub?provisioning=cancelled",
            metadata={
                "tenant_id": tenant_id,
                "module_id": "n8n-nkz",
            },
        )

        return ProvisionResponse(
            status="checkout_redirect",
            checkout_url=session.url,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stripe error: {str(e)}",
        )


@router.get("/provision/status", response_model=ProvisionStatusResponse)
async def get_provision_status(
    user: TokenPayload = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """Get n8n provisioning status for the current tenant."""
    config = get_tenant_config(tenant_id)
    if not config:
        return ProvisionStatusResponse(status="none")

    status_val = config.get("provisioning_status", "none")
    suspended_at = config.get("suspended_at")

    days_remaining = None
    if status_val == "grace_period" and suspended_at:
        try:
            from datetime import datetime, timedelta
            sat = datetime.fromisoformat(str(suspended_at).replace("Z", "+00:00"))
            elapsed = (datetime.utcnow() - sat.replace(tzinfo=None)).days
            days_remaining = max(0, settings.n8n_grace_period_days - elapsed)
        except (ValueError, AttributeError):
            pass

    # Decrypt password if available
    password = None
    encrypted_pw = config.get("n8n_admin_password_encrypted")
    if encrypted_pw:
        try:
            password = decrypt_token(encrypted_pw)
        except Exception:
            password = None

    return ProvisionStatusResponse(
        status=status_val,
        n8n_url=config.get("n8n_url"),
        username=config.get("n8n_admin_username"),
        password=password,
        suspended_at=str(suspended_at) if suspended_at else None,
        days_remaining=days_remaining,
        is_enterprise=config.get("stripe_subscription_id") is None and status_val == "active",
    )


@router.delete("/provision")
async def cancel_provision(
    user: TokenPayload = Depends(require_roles("TenantAdmin", "PlatformAdmin")),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """Cancel n8n subscription. Starts grace period."""
    config = get_tenant_config(tenant_id)
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No n8n config found")

    sub_id = config.get("stripe_subscription_id")
    if sub_id and settings.stripe_secret_key:
        try:
            stripe.api_key = settings.stripe_secret_key
            stripe.Subscription.delete(sub_id)
        except Exception:
            pass

    result = handle_suspension_event(tenant_id, "grace_period")
    return result
