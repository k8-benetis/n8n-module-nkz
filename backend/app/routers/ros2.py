"""
ROS2 Router - Agricultural robotics integration
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
import httpx

from app.config import get_settings, Settings
from app.middleware import get_current_user, get_tenant_id, require_roles, TokenPayload

router = APIRouter(prefix="/ros2")


# =============================================================================
# Models
# =============================================================================

class RobotCommand(BaseModel):
    """Command to send to robot."""
    robotId: str
    command: str  # start, stop, pause, resume, return_home, emergency_stop
    parameters: Optional[dict] = None


class MissionCreate(BaseModel):
    """Create a new robot mission."""
    name: str
    robotId: str
    type: str  # spray, harvest, seed, survey, transport
    parcelIds: List[str]
    parameters: Optional[dict] = None


# =============================================================================
# Routes
# =============================================================================

@router.get("/robots")
async def list_robots(
    user: TokenPayload = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """List all connected agricultural robots."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{settings.ros2_bridge_url}/api/robots",
                headers={"fiware-service": tenant_id}
            )
            response.raise_for_status()
            return response.json()
    except Exception:
        # Mock data for development
        return {
            "robots": [
                {
                    "id": "robot-001",
                    "name": "Tractor Autónomo 1",
                    "type": "tractor",
                    "status": "idle",
                    "batteryLevel": 85,
                    "position": {"type": "Point", "coordinates": [-2.9349, 43.2627]},
                    "lastSeen": "2025-01-12T10:00:00Z",
                },
                {
                    "id": "robot-002",
                    "name": "Drone Surveyor",
                    "type": "drone",
                    "status": "working",
                    "batteryLevel": 62,
                    "position": {"type": "Point", "coordinates": [-2.9380, 43.2610]},
                    "currentMission": "mission-001",
                    "lastSeen": "2025-01-12T10:05:00Z",
                },
                {
                    "id": "robot-003",
                    "name": "Sprayer Bot",
                    "type": "sprayer",
                    "status": "charging",
                    "batteryLevel": 23,
                    "position": {"type": "Point", "coordinates": [-2.9320, 43.2645]},
                    "lastSeen": "2025-01-12T09:45:00Z",
                },
            ]
        }


@router.get("/robots/{robot_id}")
async def get_robot(
    robot_id: str,
    user: TokenPayload = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """Get robot details."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{settings.ros2_bridge_url}/api/robots/{robot_id}",
                headers={"fiware-service": tenant_id}
            )
            response.raise_for_status()
            return response.json()
    except Exception:
        return {
            "id": robot_id,
            "name": "Robot",
            "type": "tractor",
            "status": "unknown",
            "message": "Robot data unavailable",
        }


@router.post("/commands")
async def send_robot_command(
    command: RobotCommand,
    user: TokenPayload = Depends(require_roles("TenantAdmin", "PlatformAdmin")),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """
    Send command to robot via ROS2 bridge.
    
    Commands:
    - start: Start current mission
    - stop: Stop and hold position
    - pause: Pause mission (can resume)
    - resume: Resume paused mission
    - return_home: Return to base station
    - emergency_stop: Immediate stop (safety)
    """
    valid_commands = ["start", "stop", "pause", "resume", "return_home", "emergency_stop"]
    if command.command not in valid_commands:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid command. Must be one of: {valid_commands}"
        )
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{settings.ros2_bridge_url}/api/commands",
                json={
                    "robot_id": command.robotId,
                    "command": command.command,
                    "parameters": command.parameters or {},
                    "issued_by": user.email,
                },
                headers={"fiware-service": tenant_id}
            )
            response.raise_for_status()
            return response.json()
    except Exception:
        return {
            "robotId": command.robotId,
            "command": command.command,
            "accepted": True,
            "message": f"Command '{command.command}' sent (mock)"
        }


@router.get("/missions")
async def list_missions(
    robot_id: Optional[str] = None,
    status: Optional[str] = None,
    user: TokenPayload = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """List robot missions."""
    missions = [
        {
            "id": "mission-001",
            "name": "Survey Parcela Norte",
            "robotId": "robot-002",
            "type": "survey",
            "status": "running",
            "parcelIds": ["urn:ngsi-ld:AgriParcel:parcel-001"],
            "progress": 65,
            "startedAt": "2025-01-12T09:30:00Z",
        },
        {
            "id": "mission-002",
            "name": "Spray Treatment",
            "robotId": "robot-003",
            "type": "spray",
            "status": "completed",
            "parcelIds": ["urn:ngsi-ld:AgriParcel:parcel-002"],
            "progress": 100,
            "startedAt": "2025-01-12T07:00:00Z",
            "completedAt": "2025-01-12T09:15:00Z",
        },
        {
            "id": "mission-003",
            "name": "Soil Sampling",
            "robotId": "robot-001",
            "type": "survey",
            "status": "pending",
            "parcelIds": ["urn:ngsi-ld:AgriParcel:parcel-001", "urn:ngsi-ld:AgriParcel:parcel-002"],
            "progress": 0,
        },
    ]
    
    if robot_id:
        missions = [m for m in missions if m["robotId"] == robot_id]
    if status:
        missions = [m for m in missions if m["status"] == status]
    
    return {"missions": missions}


@router.post("/missions")
async def create_mission(
    mission: MissionCreate,
    user: TokenPayload = Depends(require_roles("TenantAdmin", "PlatformAdmin")),
    tenant_id: str = Depends(get_tenant_id),
    settings: Settings = Depends(get_settings),
):
    """Create a new robot mission."""
    valid_types = ["spray", "harvest", "seed", "survey", "transport"]
    if mission.type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid mission type. Must be one of: {valid_types}"
        )
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{settings.ros2_bridge_url}/api/missions",
                json={
                    "name": mission.name,
                    "robot_id": mission.robotId,
                    "type": mission.type,
                    "parcel_ids": mission.parcelIds,
                    "parameters": mission.parameters or {},
                    "created_by": user.email,
                },
                headers={"fiware-service": tenant_id}
            )
            response.raise_for_status()
            return response.json()
    except Exception:
        import uuid
        return {
            "id": str(uuid.uuid4())[:8],
            "name": mission.name,
            "robotId": mission.robotId,
            "type": mission.type,
            "status": "pending",
            "parcelIds": mission.parcelIds,
            "progress": 0,
            "message": "Mission created (mock)"
        }


@router.get("/robots/{robot_id}/telemetry/stream")
async def get_robot_telemetry_stream_info(
    robot_id: str,
    user: TokenPayload = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """
    Get WebSocket URL for real-time robot telemetry.
    Connect to the returned URL for live position, battery, sensor updates.
    """
    return {
        "robotId": robot_id,
        "websocketUrl": f"wss://nkz.artotxiki.com/api/n8n-nkz/ros2/robots/{robot_id}/telemetry/ws",
        "protocol": "json",
        "updateInterval": "100ms",
        "fields": ["position", "heading", "speed", "batteryLevel", "sensors"],
    }
