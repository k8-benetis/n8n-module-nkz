"""Internal endpoints for tenant-webhook n8n provisioning calls."""

import os
import logging
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from app.common.n8n_provisioner import provision_n8n_tenant
from app.common.n8n_suspension_manager import handle_suspension_event

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/internal/n8n")


class ProvisionRequest(BaseModel):
    tenant_id: str
    stripe_subscription_id: str | None = None


class SuspensionEventRequest(BaseModel):
    tenant_id: str
    event: str  # "suspend" | "reactivate" | "grace_period"


def _verify_internal_secret(request: Request) -> bool:
    """Verify the internal billing secret header."""
    expected = os.getenv("INTERNAL_BILLING_SECRET", "")
    if not expected:
        logger.warning("INTERNAL_BILLING_SECRET not set, rejecting internal call")
        return False
    provided = request.headers.get("X-Internal-Billing-Secret", "")
    if not provided:
        provided = request.headers.get("X-Billing-Secret", "")
    return provided == expected


@router.post("/provision")
async def internal_provision(
    body: ProvisionRequest,
    request: Request,
):
    """Provision n8n instance for a tenant (called by tenant-webhook)."""
    if not _verify_internal_secret(request):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    if not body.tenant_id or not body.tenant_id.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing tenant_id")

    try:
        result = provision_n8n_tenant(body.tenant_id)
        return {
            "ok": True,
            "tenant_id": body.tenant_id,
            "url": result["url"],
        }
    except Exception as e:
        logger.error(f"Provisioning failed for {body.tenant_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Provisioning failed: {str(e)}",
        )


@router.post("/suspension-event")
async def internal_suspension_event(
    body: SuspensionEventRequest,
    request: Request,
):
    """Handle suspension event from Stripe (called by tenant-webhook)."""
    if not _verify_internal_secret(request):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    if body.event not in ("suspend", "reactivate", "grace_period"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid event: {body.event}",
        )

    result = handle_suspension_event(body.tenant_id, body.event)
    if not result["ok"]:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Unknown error"),
        )

    return {"ok": True, "tenant_id": body.tenant_id, "action": body.event}
