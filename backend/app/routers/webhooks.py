"""
Webhooks Router - Webhook configuration and management
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
import httpx
import uuid

from app.config import get_settings, Settings
from app.middleware import get_current_user, get_tenant_id, require_roles, TokenPayload

router = APIRouter(prefix="/webhooks")


# =============================================================================
# Models
# =============================================================================

class WebhookCreate(BaseModel):
    """Create a new webhook configuration."""
    name: str
    url: str
    secret: Optional[str] = None
    events: List[str]
    active: bool = True


class WebhookUpdate(BaseModel):
    """Update webhook configuration."""
    name: Optional[str] = None
    url: Optional[str] = None
    secret: Optional[str] = None
    events: Optional[List[str]] = None
    active: Optional[bool] = None


# =============================================================================
# In-Memory Storage (Replace with Database in Production)
# =============================================================================

_webhook_store: dict[str, dict] = {
    "wh-001": {
        "id": "wh-001",
        "name": "NDVI Alert Webhook",
        "url": "https://example.com/webhooks/ndvi",
        "events": ["ndvi.alert", "ndvi.analysis.complete"],
        "active": True,
        "lastTriggered": "2025-01-12T08:30:00Z",
        "failureCount": 0,
    },
    "wh-002": {
        "id": "wh-002",
        "name": "Robot Status Webhook",
        "url": "https://example.com/webhooks/robots",
        "events": ["robot.mission.complete", "robot.error"],
        "active": True,
        "lastTriggered": "2025-01-11T16:45:00Z",
        "failureCount": 0,
    },
}


# =============================================================================
# Routes
# =============================================================================

@router.get("")
async def list_webhooks(
    user: TokenPayload = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
):
    """List all webhook configurations."""
    return {"webhooks": list(_webhook_store.values())}


@router.post("")
async def create_webhook(
    webhook: WebhookCreate,
    user: TokenPayload = Depends(require_roles("TenantAdmin", "PlatformAdmin")),
    tenant_id: str = Depends(get_tenant_id),
):
    """Create a new webhook configuration."""
    valid_events = [
        "ndvi.alert",
        "ndvi.analysis.complete",
        "prediction.complete",
        "pest.detected",
        "robot.mission.start",
        "robot.mission.complete",
        "robot.error",
        "odoo.sync.complete",
        "notification.sent",
    ]
    
    for event in webhook.events:
        if event not in valid_events:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid event '{event}'. Valid events: {valid_events}"
            )
    
    webhook_id = f"wh-{str(uuid.uuid4())[:8]}"
    webhook_data = {
        "id": webhook_id,
        "name": webhook.name,
        "url": webhook.url,
        "secret": webhook.secret,
        "events": webhook.events,
        "active": webhook.active,
        "lastTriggered": None,
        "failureCount": 0,
    }
    
    _webhook_store[webhook_id] = webhook_data
    
    return webhook_data


@router.put("/{webhook_id}")
async def update_webhook(
    webhook_id: str,
    webhook: WebhookUpdate,
    user: TokenPayload = Depends(require_roles("TenantAdmin", "PlatformAdmin")),
    tenant_id: str = Depends(get_tenant_id),
):
    """Update webhook configuration."""
    if webhook_id not in _webhook_store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Webhook {webhook_id} not found"
        )
    
    existing = _webhook_store[webhook_id]
    
    if webhook.name is not None:
        existing["name"] = webhook.name
    if webhook.url is not None:
        existing["url"] = webhook.url
    if webhook.secret is not None:
        existing["secret"] = webhook.secret
    if webhook.events is not None:
        existing["events"] = webhook.events
    if webhook.active is not None:
        existing["active"] = webhook.active
    
    return existing


@router.delete("/{webhook_id}")
async def delete_webhook(
    webhook_id: str,
    user: TokenPayload = Depends(require_roles("TenantAdmin", "PlatformAdmin")),
    tenant_id: str = Depends(get_tenant_id),
):
    """Delete webhook configuration."""
    if webhook_id not in _webhook_store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Webhook {webhook_id} not found"
        )
    
    del _webhook_store[webhook_id]
    return {"message": f"Webhook {webhook_id} deleted"}


@router.post("/{webhook_id}/test")
async def test_webhook(
    webhook_id: str,
    user: TokenPayload = Depends(require_roles("TenantAdmin", "PlatformAdmin")),
    tenant_id: str = Depends(get_tenant_id),
):
    """Test webhook by sending a test payload."""
    if webhook_id not in _webhook_store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Webhook {webhook_id} not found"
        )
    
    webhook = _webhook_store[webhook_id]
    
    test_payload = {
        "event": "test",
        "timestamp": "2025-01-12T10:00:00Z",
        "data": {
            "message": "This is a test webhook from n8n Integration Hub",
            "triggeredBy": user.email,
        }
    }
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {"Content-Type": "application/json"}
            if webhook.get("secret"):
                headers["X-Webhook-Secret"] = webhook["secret"]
            
            response = await client.post(
                webhook["url"],
                json=test_payload,
                headers=headers
            )
            
            return {
                "success": response.status_code < 400,
                "statusCode": response.status_code,
                "response": response.text[:500] if response.text else None,
            }
    except httpx.RequestError as e:
        return {
            "success": False,
            "error": str(e),
        }


# =============================================================================
# Inbound Webhook Endpoint (receives callbacks from n8n/external services)
# =============================================================================

@router.post("/inbound")
async def handle_inbound_webhook(
    payload: dict,
    source: Optional[str] = None,
):
    """
    Handle inbound webhooks from n8n or external services.
    
    This endpoint receives callbacks and routes them to appropriate handlers.
    No authentication required for webhooks (verify via secret in payload).
    """
    event_type = payload.get("event") or payload.get("type")
    
    # Log webhook receipt
    print(f"[Webhook] Received {event_type} from {source}: {payload}")
    
    # Route to appropriate handler based on event type
    # In production, would process and store/forward the data
    
    return {
        "received": True,
        "event": event_type,
        "timestamp": "2025-01-12T10:00:00Z",
    }
