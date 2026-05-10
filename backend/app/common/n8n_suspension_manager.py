"""Grace period checker and Stripe event handler for n8n instances."""

import logging
from datetime import datetime, timedelta
from app.common.n8n_provisioner import (
    suspend_n8n_tenant,
    reactivate_n8n_tenant,
    start_grace_period_n8n_tenant,
    purge_n8n_tenant,
)
from app.common.tenant_config_service import get_tenant_config
from app.common.db import get_db_connection_safe
from app.config import get_settings

logger = logging.getLogger(__name__)


def handle_suspension_event(tenant_id: str, event: str) -> dict:
    """Handle a suspension event from Stripe webhook.

    Args:
        tenant_id: The tenant ID.
        event: One of "suspend", "reactivate", "grace_period".

    Returns:
        {"ok": bool, "action": str, "error": str|None}
    """
    actions = {
        "suspend": suspend_n8n_tenant,
        "reactivate": reactivate_n8n_tenant,
        "grace_period": start_grace_period_n8n_tenant,
    }

    if event not in actions:
        return {"ok": False, "action": event, "error": f"Unknown event: {event}"}

    fn = actions[event]
    ok = fn(tenant_id)
    return {"ok": ok, "action": event, "error": None if ok else f"{event} failed"}


def check_grace_periods() -> list[str]:
    """Check all tenants in grace_period and purge those past deadline.

    Returns list of purged tenant IDs.
    """
    settings = get_settings()
    grace_days = settings.n8n_grace_period_days
    purged = []

    conn = get_db_connection_safe()
    if not conn:
        return purged

    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT tenant_id, config
            FROM admin_platform.tenant_module_config
            WHERE module_id = 'n8n-nkz'
              AND config->>'provisioning_status' = 'grace_period'
        """)
        rows = cur.fetchall()
        cur.close()

        now = datetime.utcnow()
        for tenant_id, config in rows:
            if isinstance(config, str):
                import json
                config = json.loads(config)
            suspended_at_str = config.get("suspended_at")
            if not suspended_at_str:
                continue
            try:
                suspended_at = datetime.fromisoformat(
                    str(suspended_at_str).replace("Z", "+00:00")
                )
            except (ValueError, AttributeError):
                continue

            if now - suspended_at.replace(tzinfo=None) > timedelta(days=grace_days):
                logger.info(f"Purging n8n instance for tenant {tenant_id} (grace period expired)")
                if purge_n8n_tenant(tenant_id):
                    purged.append(tenant_id)

    except Exception as e:
        logger.error(f"check_grace_periods failed: {e}")
    finally:
        conn.close()

    return purged


def start_scheduler():
    """Start the APScheduler background job for grace period checks."""
    from apscheduler.schedulers.background import BackgroundScheduler

    scheduler = BackgroundScheduler()
    scheduler.add_job(
        check_grace_periods,
        trigger="interval",
        hours=24,
        id="n8n_grace_period_check",
        name="Check n8n grace periods",
    )
    scheduler.start()
    logger.info("n8n suspension manager scheduler started")
    return scheduler
