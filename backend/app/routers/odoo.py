"""
Odoo Router - ERP integration for farm management
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
import httpx

from app.config import get_settings, Settings
from app.middleware import get_current_user, get_tenant_id, require_roles, TokenPayload

router = APIRouter(prefix="/odoo")


# =============================================================================
# Models
# =============================================================================

class OdooSyncRequest(BaseModel):
    """Request to trigger Odoo sync."""
    entities: Optional[List[str]] = None  # parcels, harvests, inventory, contacts


class OdooPushRequest(BaseModel):
    """Request to push data to Odoo."""
    data: dict


# =============================================================================
# Routes
# =============================================================================

@router.get("/status")
async def get_odoo_sync_status(
    user: TokenPayload = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """Get Odoo synchronization status."""
    if not settings.odoo_url:
        return {
            "status": "not_configured",
            "message": "Odoo integration not configured",
        }
    
    # In production, would check actual sync status from database
    return {
        "lastSync": "2025-01-12T08:00:00Z",
        "status": "synced",
        "entitiesSynced": 156,
        "syncDetails": {
            "parcels": {"synced": 45, "errors": 0},
            "harvests": {"synced": 89, "errors": 2},
            "inventory": {"synced": 22, "errors": 0},
        }
    }


@router.post("/sync")
async def trigger_odoo_sync(
    request: Optional[OdooSyncRequest] = None,
    user: TokenPayload = Depends(require_roles("TenantAdmin", "PlatformAdmin")),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """
    Trigger manual synchronization with Odoo.
    
    Syncs:
    - parcels: Agricultural parcels and their properties
    - harvests: Harvest records and production data
    - inventory: Farm inventory and stock levels
    - contacts: Suppliers, clients, workers
    """
    if not settings.odoo_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Odoo integration not configured"
        )
    
    entities = request.entities if request else ["parcels", "harvests", "inventory"]
    
    # In production, would trigger actual sync via n8n workflow
    import uuid
    return {
        "jobId": str(uuid.uuid4()),
        "status": "syncing",
        "entities": entities,
        "message": f"Sync started for: {', '.join(entities)}"
    }


@router.get("/parcels")
async def get_odoo_parcels(
    user: TokenPayload = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """Get parcels synced from Odoo."""
    # Mock data - in production would query synced data
    return {
        "parcels": [
            {
                "id": 1,
                "odooId": 101,
                "name": "Parcela Norte",
                "area": 12.5,
                "areaUnit": "ha",
                "cropType": "wheat",
                "status": "active",
                "nkzEntityId": "urn:ngsi-ld:AgriParcel:parcel-001",
            },
            {
                "id": 2,
                "odooId": 102,
                "name": "Parcela Sur",
                "area": 8.3,
                "areaUnit": "ha",
                "cropType": "corn",
                "status": "active",
                "nkzEntityId": "urn:ngsi-ld:AgriParcel:parcel-002",
            },
        ]
    }


@router.get("/harvests")
async def get_odoo_harvests(
    parcel_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: TokenPayload = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
):
    """Get harvest records from Odoo."""
    harvests = [
        {
            "id": 1,
            "odooId": 201,
            "parcelId": 1,
            "parcelName": "Parcela Norte",
            "cropType": "wheat",
            "quantity": 45000,
            "quantityUnit": "kg",
            "quality": "Grade A",
            "harvestDate": "2024-09-15",
        },
        {
            "id": 2,
            "odooId": 202,
            "parcelId": 2,
            "parcelName": "Parcela Sur",
            "cropType": "corn",
            "quantity": 38000,
            "quantityUnit": "kg",
            "quality": "Grade B",
            "harvestDate": "2024-10-20",
        },
    ]
    
    if parcel_id:
        harvests = [h for h in harvests if h["parcelId"] == parcel_id]
    
    return {"harvests": harvests}


@router.post("/push/{model}")
async def push_to_odoo(
    model: str,
    request: OdooPushRequest,
    user: TokenPayload = Depends(require_roles("TenantAdmin", "PlatformAdmin")),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """
    Push data to Odoo.
    
    Models:
    - harvest: Create/update harvest record
    - inventory: Update inventory levels
    - task: Create work order/task
    """
    if not settings.odoo_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Odoo integration not configured"
        )
    
    valid_models = ["harvest", "inventory", "task", "contact"]
    if model not in valid_models:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid model. Must be one of: {valid_models}"
        )
    
    # In production, would call Odoo XML-RPC API
    import random
    return {
        "odooId": random.randint(1000, 9999),
        "model": model,
        "status": "created",
        "message": f"Record created in Odoo {model} model"
    }
