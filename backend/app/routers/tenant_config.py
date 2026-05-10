"""Tenant n8n configuration endpoints (TenantAdmin only)."""

import re
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.config import get_settings, Settings
from app.middleware import get_current_user, get_tenant_id, require_roles, TokenPayload
from app.common.tenant_config_service import get_tenant_config, upsert_tenant_config, mask_api_key
from app.common.fernet_crypto import encrypt_token

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
