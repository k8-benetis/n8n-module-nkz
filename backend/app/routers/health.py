"""
Health Router - Integration health checks
"""

from typing import Optional
from fastapi import APIRouter, Depends
import httpx

from app.config import get_settings, Settings
from app.middleware import get_current_user, TokenPayload

router = APIRouter(prefix="/health")


@router.get("/integrations")
async def get_integrations_health(
    user: TokenPayload = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """
    Get health status of all integrations.
    Returns status for n8n, sentinel, intelligence, notifications, odoo, ros2.
    """
    integrations = []
    
    async def check_service(id: str, name: str, url: str, health_path: str = "/health"):
        """Check if a service is healthy."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                start = httpx.utils.current_timestamp()
                response = await client.get(f"{url}{health_path}")
                latency = int((httpx.utils.current_timestamp() - start) * 1000)
                
                if response.status_code == 200:
                    return {
                        "id": id,
                        "name": name,
                        "status": "healthy",
                        "latency": latency,
                        "lastCheck": httpx.utils.current_timestamp(),
                    }
                else:
                    return {
                        "id": id,
                        "name": name,
                        "status": "degraded",
                        "latency": latency,
                        "message": f"HTTP {response.status_code}",
                        "lastCheck": httpx.utils.current_timestamp(),
                    }
        except httpx.TimeoutException:
            return {
                "id": id,
                "name": name,
                "status": "unhealthy",
                "message": "Timeout",
                "lastCheck": httpx.utils.current_timestamp(),
            }
        except Exception as e:
            return {
                "id": id,
                "name": name,
                "status": "unknown",
                "message": str(e),
                "lastCheck": httpx.utils.current_timestamp(),
            }
    
    # Check all services
    services = [
        ("n8n", "n8n Core", settings.n8n_url, "/healthz"),
        ("intelligence", "Intelligence AI", settings.intelligence_url, "/health"),
        ("sentinel", "Sentinel/NDVI", settings.ndvi_worker_url, "/health"),
        ("notifications", "Notifications", settings.email_service_url, "/health"),
        ("ros2", "ROS2 Robotics", settings.ros2_bridge_url, "/health"),
    ]
    
    for service_id, name, url, health_path in services:
        if url:
            result = await check_service(service_id, name, url, health_path)
            integrations.append(result)
        else:
            integrations.append({
                "id": service_id,
                "name": name,
                "status": "unknown",
                "message": "Not configured",
            })
    
    # Odoo requires special handling (XML-RPC)
    if settings.odoo_url:
        integrations.append({
            "id": "odoo",
            "name": "Odoo ERP",
            "status": "healthy" if settings.odoo_url else "unknown",
            "message": "Configured" if settings.odoo_url else "Not configured",
        })
    else:
        integrations.append({
            "id": "odoo",
            "name": "Odoo ERP",
            "status": "unknown",
            "message": "Not configured",
        })
    
    return integrations


@router.get("/integrations/{integration_id}")
async def get_integration_health(
    integration_id: str,
    user: TokenPayload = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Get health status of a specific integration."""
    all_health = await get_integrations_health(user, settings)
    
    for health in all_health:
        if health["id"] == integration_id:
            return health
    
    return {
        "id": integration_id,
        "name": integration_id,
        "status": "unknown",
        "message": "Integration not found",
    }
