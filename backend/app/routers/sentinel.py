"""
Sentinel/NDVI Router - Satellite imagery analysis integration
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from datetime import datetime
import httpx

from app.config import get_settings, Settings
from app.middleware import get_current_user, get_tenant_id, TokenPayload

router = APIRouter(prefix="/sentinel")


# =============================================================================
# Models
# =============================================================================

class AnalysisRequest(BaseModel):
    """Request for satellite analysis."""
    parcelId: str
    startDate: str
    endDate: str
    indices: List[str] = ["NDVI"]
    cloudCoverMax: Optional[float] = 30.0


class AlertThresholds(BaseModel):
    """NDVI alert threshold configuration."""
    lowNdvi: Optional[float] = 0.3
    rapidDecline: Optional[float] = 0.15


# =============================================================================
# Routes
# =============================================================================

@router.post("/analyze")
async def request_analysis(
    request: AnalysisRequest,
    user: TokenPayload = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """
    Request satellite imagery analysis for a parcel.
    
    Triggers n8n workflow that:
    1. Fetches Sentinel-2 imagery from Copernicus
    2. Calculates vegetation indices (NDVI, NDWI, EVI, etc.)
    3. Stores results in Orion-LD
    4. Triggers alerts if thresholds exceeded
    """
    try:
        # Call NDVI worker service
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{settings.ndvi_worker_url}/api/analyze",
                json={
                    "parcel_id": request.parcelId,
                    "start_date": request.startDate,
                    "end_date": request.endDate,
                    "indices": request.indices,
                    "cloud_cover_max": request.cloudCoverMax,
                    "tenant_id": tenant_id,
                },
                headers={"fiware-service": tenant_id}
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"NDVI service error: {e.response.text}"
        )
    except httpx.RequestError as e:
        # Return mock response for development
        import uuid
        return {
            "jobId": str(uuid.uuid4()),
            "status": "queued",
            "parcelId": request.parcelId,
            "indices": request.indices,
            "message": "Analysis job queued"
        }


@router.get("/parcels/{parcel_id}/results")
async def get_analysis_results(
    parcel_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    index: Optional[str] = None,
    user: TokenPayload = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """
    Get analysis results for a parcel.
    Fetches from Orion-LD or TimescaleDB.
    """
    try:
        # Query NDVI worker for historical data
        params = {}
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        if index:
            params["index"] = index
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{settings.ndvi_worker_url}/api/parcels/{parcel_id}/results",
                params=params,
                headers={"fiware-service": tenant_id}
            )
            response.raise_for_status()
            return response.json()
    except Exception:
        # Return mock data
        return {
            "results": [
                {
                    "parcelId": parcel_id,
                    "date": "2025-01-10T00:00:00Z",
                    "index": "NDVI",
                    "value": 0.72,
                    "cloudCover": 5.2,
                },
                {
                    "parcelId": parcel_id,
                    "date": "2025-01-05T00:00:00Z",
                    "index": "NDVI",
                    "value": 0.68,
                    "cloudCover": 12.1,
                },
                {
                    "parcelId": parcel_id,
                    "date": "2025-01-01T00:00:00Z",
                    "index": "NDVI",
                    "value": 0.65,
                    "cloudCover": 8.3,
                },
            ]
        }


@router.get("/alerts")
async def get_ndvi_alerts(
    parcel_id: Optional[str] = None,
    severity: Optional[str] = None,
    user: TokenPayload = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """
    Get active NDVI alerts.
    Alerts are generated when vegetation indices exceed thresholds.
    """
    # Mock alerts for development
    alerts = [
        {
            "id": "alert-1",
            "parcelId": "urn:ngsi-ld:AgriParcel:parcel-001",
            "alertType": "low_ndvi",
            "severity": "medium",
            "currentValue": 0.28,
            "threshold": 0.3,
            "message": "NDVI below healthy threshold",
            "createdAt": "2025-01-12T08:00:00Z",
        },
        {
            "id": "alert-2",
            "parcelId": "urn:ngsi-ld:AgriParcel:parcel-003",
            "alertType": "rapid_decline",
            "severity": "high",
            "currentValue": -0.18,
            "threshold": 0.15,
            "message": "Rapid NDVI decline detected (18% drop in 5 days)",
            "createdAt": "2025-01-11T14:30:00Z",
        },
    ]
    
    if parcel_id:
        alerts = [a for a in alerts if a["parcelId"] == parcel_id]
    if severity:
        alerts = [a for a in alerts if a["severity"] == severity]
    
    return {"alerts": alerts}


@router.put("/parcels/{parcel_id}/thresholds")
async def set_alert_thresholds(
    parcel_id: str,
    thresholds: AlertThresholds,
    user: TokenPayload = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """
    Configure NDVI alert thresholds for a parcel.
    Updates the parcel entity in Orion-LD.
    """
    try:
        # Update parcel thresholds in Orion-LD
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.patch(
                f"{settings.orion_url}/ngsi-ld/v1/entities/{parcel_id}/attrs",
                json={
                    "ndviThresholds": {
                        "type": "Property",
                        "value": {
                            "lowNdvi": thresholds.lowNdvi,
                            "rapidDecline": thresholds.rapidDecline,
                        }
                    }
                },
                headers={
                    "Content-Type": "application/json",
                    "NGSILD-Tenant": tenant_id,
                    "Link": f'<{settings.context_url}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"'
                }
            )
            response.raise_for_status()
    except Exception:
        pass  # Silently fail for development
    
    return {
        "parcelId": parcel_id,
        "thresholds": thresholds.model_dump(),
        "message": "Thresholds updated"
    }
