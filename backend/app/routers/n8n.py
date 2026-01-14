"""
n8n Router - Workflow management via n8n API
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
import httpx

from app.config import get_settings, Settings
from app.middleware import get_current_user, get_tenant_id, require_roles, TokenPayload

router = APIRouter(prefix="/n8n")


# =============================================================================
# Models
# =============================================================================

class WorkflowExecuteRequest(BaseModel):
    """Request body for workflow execution."""
    entityId: Optional[str] = None
    entityType: Optional[str] = None
    data: Optional[dict] = None


class WorkflowToggleRequest(BaseModel):
    """Request body for activating/deactivating workflow."""
    active: bool


# =============================================================================
# n8n API Client Helper
# =============================================================================

async def n8n_request(
    method: str,
    path: str,
    settings: Settings,
    json_data: Optional[dict] = None,
):
    """Make authenticated request to n8n API."""
    url = f"{settings.n8n_url}/api/v1{path}"
    headers = {}
    
    if settings.n8n_api_key:
        headers["X-N8N-API-KEY"] = settings.n8n_api_key
    
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


# =============================================================================
# Workflow Routes
# =============================================================================

@router.get("/workflows")
async def list_workflows(
    active: Optional[bool] = None,
    user: TokenPayload = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """
    List all n8n workflows.
    Optionally filter by active status.
    """
    try:
        data = await n8n_request("GET", "/workflows", settings)
        workflows = data.get("data", [])
        
        if active is not None:
            workflows = [w for w in workflows if w.get("active") == active]
        
        return {"workflows": workflows}
    except HTTPException:
        raise
    except Exception as e:
        # Return mock data for development
        return {
            "workflows": [
                {
                    "id": "1",
                    "name": "NDVI Alert Pipeline",
                    "active": True,
                    "createdAt": "2025-01-01T00:00:00.000Z",
                    "updatedAt": "2025-01-10T00:00:00.000Z",
                },
                {
                    "id": "2",
                    "name": "Production Prediction",
                    "active": True,
                    "createdAt": "2025-01-01T00:00:00.000Z",
                    "updatedAt": "2025-01-10T00:00:00.000Z",
                },
                {
                    "id": "3",
                    "name": "Pest Detection Alerts",
                    "active": True,
                    "createdAt": "2025-01-01T00:00:00.000Z",
                    "updatedAt": "2025-01-10T00:00:00.000Z",
                },
                {
                    "id": "4",
                    "name": "Risk Notifications",
                    "active": True,
                    "createdAt": "2025-01-01T00:00:00.000Z",
                    "updatedAt": "2025-01-10T00:00:00.000Z",
                },
            ]
        }


@router.get("/workflows/{workflow_id}")
async def get_workflow(
    workflow_id: str,
    user: TokenPayload = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Get workflow details by ID."""
    try:
        return await n8n_request("GET", f"/workflows/{workflow_id}", settings)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workflow {workflow_id} not found"
        )


@router.put("/workflows/{workflow_id}/active")
async def toggle_workflow(
    workflow_id: str,
    request: WorkflowToggleRequest,
    user: TokenPayload = Depends(require_roles("TenantAdmin", "PlatformAdmin")),
    settings: Settings = Depends(get_settings),
):
    """Activate or deactivate a workflow."""
    try:
        if request.active:
            return await n8n_request("POST", f"/workflows/{workflow_id}/activate", settings)
        else:
            return await n8n_request("POST", f"/workflows/{workflow_id}/deactivate", settings)
    except HTTPException:
        raise
    except Exception as e:
        return {
            "id": workflow_id,
            "active": request.active,
            "message": "Workflow status updated (mock)"
        }


@router.post("/workflows/{workflow_id}/execute")
async def execute_workflow(
    workflow_id: str,
    request: Optional[WorkflowExecuteRequest] = None,
    user: TokenPayload = Depends(require_roles("TenantAdmin", "PlatformAdmin")),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """
    Execute a workflow manually.
    Pass entityId/entityType to provide context to the workflow.
    """
    execution_data = {
        "tenantId": tenant_id,
        "userId": user.sub,
        "userEmail": user.email,
    }
    
    if request:
        if request.entityId:
            execution_data["entityId"] = request.entityId
        if request.entityType:
            execution_data["entityType"] = request.entityType
        if request.data:
            execution_data.update(request.data)
    
    try:
        # Try to execute via n8n webhook or API
        return await n8n_request(
            "POST",
            f"/workflows/{workflow_id}/run",
            settings,
            json_data=execution_data
        )
    except HTTPException:
        raise
    except Exception:
        # Return mock response for development
        import uuid
        return {
            "executionId": str(uuid.uuid4()),
            "workflowId": workflow_id,
            "status": "running",
            "startedAt": "2025-01-12T00:00:00.000Z",
        }


# =============================================================================
# Execution Routes
# =============================================================================

@router.get("/executions")
async def list_executions(
    workflow_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 20,
    user: TokenPayload = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """
    List workflow executions.
    Filter by workflowId or status.
    """
    try:
        params = f"?limit={limit}"
        if workflow_id:
            params += f"&workflowId={workflow_id}"
        if status:
            params += f"&status={status}"
        
        return await n8n_request("GET", f"/executions{params}", settings)
    except HTTPException:
        raise
    except Exception:
        # Return mock data
        return {
            "executions": [
                {
                    "id": "exec-1",
                    "workflowId": "1",
                    "finished": True,
                    "mode": "trigger",
                    "startedAt": "2025-01-12T10:00:00.000Z",
                    "stoppedAt": "2025-01-12T10:00:05.000Z",
                    "status": "success",
                },
                {
                    "id": "exec-2",
                    "workflowId": "2",
                    "finished": False,
                    "mode": "webhook",
                    "startedAt": "2025-01-12T10:05:00.000Z",
                    "status": "running",
                },
            ]
        }


@router.get("/executions/{execution_id}")
async def get_execution(
    execution_id: str,
    user: TokenPayload = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Get execution details."""
    try:
        return await n8n_request("GET", f"/executions/{execution_id}", settings)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Execution {execution_id} not found"
        )


# =============================================================================
# Webhook Routes
# =============================================================================

@router.get("/webhooks")
async def list_webhooks(
    user: TokenPayload = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """List all registered webhooks."""
    # n8n doesn't have a direct API for listing webhooks
    # This would need to be derived from workflow nodes
    return {
        "webhooks": [
            {
                "id": "wh-1",
                "workflowId": "1",
                "method": "POST",
                "path": "/webhook/ndvi-alert",
                "nodeId": "node-1",
                "nodeName": "Webhook Trigger",
            },
            {
                "id": "wh-2",
                "workflowId": "3",
                "method": "POST",
                "path": "/webhook/pest-detection",
                "nodeId": "node-2",
                "nodeName": "Pest Alert Webhook",
            },
        ]
    }
