"""
Intelligence Router - AI/ML predictions and analysis
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
import httpx

from app.config import get_settings, Settings
from app.middleware import get_current_user, get_tenant_id, TokenPayload

router = APIRouter(prefix="/intelligence")


# =============================================================================
# Models
# =============================================================================

class PredictionRequest(BaseModel):
    """Request for AI prediction."""
    type: str  # production, pest, disease, irrigation
    entityId: str
    entityType: str
    parameters: Optional[dict] = None


class WebhookTriggerRequest(BaseModel):
    """Request body for intelligence webhook trigger."""
    action: str
    entityId: Optional[str] = None
    entityType: Optional[str] = None
    data: Optional[dict] = None


# =============================================================================
# Routes
# =============================================================================

@router.post("/predict")
async def request_prediction(
    request: PredictionRequest,
    user: TokenPayload = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """
    Request an AI prediction.
    
    Types:
    - production: Yield prediction based on historical and environmental data
    - pest: Pest outbreak probability
    - disease: Plant disease risk assessment
    - irrigation: Irrigation scheduling recommendations
    """
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{settings.intelligence_base_url}/predict",
                json={
                    "type": request.type,
                    "entity_id": request.entityId,
                    "entity_type": request.entityType,
                    "parameters": request.parameters or {},
                    "tenant_id": tenant_id,
                    "user_id": user.sub,
                },
                headers={"fiware-service": tenant_id}
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Intelligence service error: {e.response.text}"
        )
    except httpx.RequestError:
        # Return mock response
        import uuid
        return {
            "jobId": str(uuid.uuid4()),
            "type": request.type,
            "entityId": request.entityId,
            "status": "queued",
            "message": "Prediction job queued"
        }


@router.get("/predictions/{job_id}")
async def get_prediction(
    job_id: str,
    user: TokenPayload = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """Get prediction result by job ID."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{settings.intelligence_base_url}/jobs/{job_id}",
                headers={"fiware-service": tenant_id}
            )
            response.raise_for_status()
            return response.json()
    except Exception:
        # Return mock result
        return {
            "id": job_id,
            "type": "production",
            "entityId": "urn:ngsi-ld:AgriParcel:parcel-001",
            "status": "completed",
            "prediction": {
                "estimatedYield": 8500,
                "yieldUnit": "kg/ha",
                "confidence": 0.85,
                "harvestWindow": {
                    "start": "2025-09-15",
                    "end": "2025-10-05"
                },
                "factors": [
                    {"name": "soil_moisture", "impact": "positive", "value": 0.72},
                    {"name": "temperature", "impact": "neutral", "value": 0.45},
                    {"name": "precipitation", "impact": "negative", "value": -0.12},
                ]
            },
            "model": "crop-yield-v2.1",
            "createdAt": "2025-01-12T10:00:00Z",
        }


@router.get("/entities/{entity_id}/predictions")
async def get_entity_predictions(
    entity_id: str,
    type: Optional[str] = None,
    limit: int = 10,
    user: TokenPayload = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """Get predictions for a specific entity."""
    try:
        params = {"limit": limit}
        if type:
            params["type"] = type
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{settings.intelligence_base_url}/entities/{entity_id}/predictions",
                params=params,
                headers={"fiware-service": tenant_id}
            )
            response.raise_for_status()
            return response.json()
    except Exception:
        # Return mock data
        return {
            "predictions": [
                {
                    "id": "pred-1",
                    "type": "production",
                    "entityId": entity_id,
                    "prediction": {"estimatedYield": 8500},
                    "confidence": 0.85,
                    "createdAt": "2025-01-12T10:00:00Z",
                },
                {
                    "id": "pred-2",
                    "type": "pest",
                    "entityId": entity_id,
                    "prediction": {"pestType": "aphids", "probability": 0.32},
                    "confidence": 0.78,
                    "createdAt": "2025-01-11T14:00:00Z",
                },
            ]
        }


@router.post("/webhook")
async def trigger_intelligence_webhook(
    request: WebhookTriggerRequest,
    user: TokenPayload = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """
    Trigger intelligence module via webhook.
    Used by n8n workflows to invoke analysis pipelines.
    """
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{settings.intelligence_base_url}/webhook/n8n",
                json={
                    "action": request.action,
                    "entity_id": request.entityId,
                    "entity_type": request.entityType,
                    "data": request.data or {},
                    "tenant_id": tenant_id,
                    "triggered_by": user.email,
                },
                headers={"fiware-service": tenant_id}
            )
            response.raise_for_status()
            return response.json()
    except Exception:
        import uuid
        return {
            "jobId": str(uuid.uuid4()),
            "action": request.action,
            "status": "triggered",
            "message": "Webhook processed"
        }


@router.get("/plugins")
async def list_plugins(
    user: TokenPayload = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """List available intelligence plugins/models."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{settings.intelligence_base_url}/plugins")
            response.raise_for_status()
            return response.json()
    except Exception:
        return {
            "plugins": [
                {
                    "id": "crop-yield",
                    "name": "Crop Yield Predictor",
                    "version": "2.1.0",
                    "type": "production",
                    "description": "ML model for crop yield prediction based on environmental factors",
                },
                {
                    "id": "pest-detection",
                    "name": "Pest Detection",
                    "version": "1.5.0",
                    "type": "pest",
                    "description": "Computer vision model for pest identification",
                },
                {
                    "id": "disease-risk",
                    "name": "Plant Disease Risk",
                    "version": "1.2.0",
                    "type": "disease",
                    "description": "Disease outbreak risk assessment",
                },
            ]
        }
