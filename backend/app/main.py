"""
n8n Integration Hub Backend - FastAPI Application

Main entry point for the backend service.
Provides workflow orchestration connecting n8n with platform services.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import (
    health,
    n8n,
    sentinel,
    intelligence,
    notifications,
    odoo,
    ros2,
    webhooks,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown events."""
    # Startup
    settings = get_settings()
    print(f"🚀 {settings.app_name} v{settings.app_version} starting...")
    print(f"   API Prefix: {settings.api_prefix}")
    print(f"   Debug Mode: {settings.debug}")
    print(f"   n8n URL: {settings.n8n_url}")
    print(f"   Intelligence URL: {settings.intelligence_url}")
    
    yield
    
    # Shutdown
    print(f"👋 {settings.app_name} shutting down...")


def create_app() -> FastAPI:
    """Application factory."""
    settings = get_settings()
    
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="""
## n8n Integration Hub

Workflow orchestration module for Nekazari Platform.

### Features
- **n8n Workflows**: Manage and execute automation workflows
- **Sentinel/NDVI**: Trigger satellite imagery analysis
- **Intelligence AI**: ML predictions for production and pests
- **Notifications**: Multi-channel alert orchestration
- **Odoo ERP**: Farm management synchronization
- **ROS2 Robotics**: Agricultural robot control

### Authentication
All endpoints require a valid Keycloak JWT token.
Use Bearer authentication with your access token.
        """,
        docs_url=f"{settings.api_prefix}/docs",
        redoc_url=f"{settings.api_prefix}/redoc",
        openapi_url=f"{settings.api_prefix}/openapi.json",
        lifespan=lifespan,
    )
    
    # CORS Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Health check (at root for k8s probes)
    @app.get("/health")
    async def health_check():
        """Health check endpoint for Kubernetes probes."""
        return {
            "status": "healthy",
            "service": settings.app_name,
            "version": settings.app_version,
        }
    
    # Include routers
    app.include_router(health.router, prefix=settings.api_prefix, tags=["Health"])
    app.include_router(n8n.router, prefix=settings.api_prefix, tags=["n8n Workflows"])
    app.include_router(sentinel.router, prefix=settings.api_prefix, tags=["Sentinel/NDVI"])
    app.include_router(intelligence.router, prefix=settings.api_prefix, tags=["Intelligence AI"])
    app.include_router(notifications.router, prefix=settings.api_prefix, tags=["Notifications"])
    app.include_router(odoo.router, prefix=settings.api_prefix, tags=["Odoo ERP"])
    app.include_router(ros2.router, prefix=settings.api_prefix, tags=["ROS2 Robotics"])
    app.include_router(webhooks.router, prefix=settings.api_prefix, tags=["Webhooks"])
    
    return app


# Create application instance
app = create_app()
