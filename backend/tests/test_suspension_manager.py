"""Unit tests for n8n suspension manager."""

from unittest.mock import patch

from app.common.n8n_suspension_manager import handle_suspension_event


def test_handle_unknown_event():
    result = handle_suspension_event("test-tenant", "invalid_event")
    assert result["ok"] is False
    assert "Unknown event" in result["error"]


@patch("app.common.n8n_suspension_manager.suspend_n8n_tenant", return_value=True)
@patch("app.common.n8n_suspension_manager.reactivate_n8n_tenant", return_value=True)
@patch("app.common.n8n_suspension_manager.start_grace_period_n8n_tenant", return_value=True)
def test_handle_valid_events_accept(mock_grace, mock_reactivate, mock_suspend):
    """Valid event names dispatch to the correct provisioner function."""
    for event in ("suspend", "reactivate", "grace_period"):
        result = handle_suspension_event("test-tenant", event)
        assert result["ok"] is True
        assert result["action"] == event
        assert result["error"] is None
