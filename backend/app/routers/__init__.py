"""
n8n Integration Hub - API Routers

All routers for the various integrations.
"""

from app.routers import health
from app.routers import n8n
from app.routers import sentinel
from app.routers import intelligence
from app.routers import notifications
from app.routers import odoo
from app.routers import ros2
from app.routers import webhooks

__all__ = [
    "health",
    "n8n",
    "sentinel",
    "intelligence",
    "notifications",
    "odoo",
    "ros2",
    "webhooks",
]
