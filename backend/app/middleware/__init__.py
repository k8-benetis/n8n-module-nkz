"""
n8n Integration Hub Backend - Authentication Middleware

Delegates JWT validation to the api-gateway via nkz-platform-sdk.
Maintains backwards compatibility with existing routers.
"""

from typing import Optional
from fastapi import Header, Depends, HTTPException, status
from nkz_platform_sdk.auth import require_auth, AuthContext

class TokenPayload:
    """Wrapper for AuthContext to maintain backwards compatibility with existing routers."""
    def __init__(self, context: AuthContext):
        self._context = context
    
    @property
    def tenant_id(self) -> str:
        return self._context.tenant_id
    
    @property
    def roles(self) -> list[str]:
        return list(self._context.roles)
    
    def has_role(self, role: str) -> bool:
        return self._context.has_role(role)
    
    def has_any_role(self, roles: list[str]) -> bool:
        return self._context.has_any_role(roles)


async def get_current_user(context: AuthContext = require_auth()) -> TokenPayload:
    """
    Returns the current user based on gateway-injected headers.
    """
    return TokenPayload(context)


async def get_optional_user(
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-ID"),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
    x_user_roles: Optional[str] = Header(None, alias="X-User-Roles"),
) -> Optional[TokenPayload]:
    """
    Same as get_current_user but returns None for unauthenticated requests.
    Useful for endpoints that work differently for authenticated vs anonymous users.
    """
    if not x_tenant_id or not x_user_id:
        return None
    
    roles = tuple(r.strip() for r in (x_user_roles or "").split(",") if r.strip())
    context = AuthContext(
        tenant_id=x_tenant_id,
        user_id=x_user_id,
        roles=roles
    )
    return TokenPayload(context)


def require_roles(*required_roles: str):
    """
    Dependency factory that requires specific roles.
    """
    def role_checker(context: AuthContext = require_auth(roles=list(required_roles))) -> TokenPayload:
        return TokenPayload(context)
    return role_checker


def get_tenant_id(
    x_tenant_id: Optional[str] = Header(None, alias="x-tenant-id"),
    ngsild_tenant: Optional[str] = Header(None, alias="ngsild-tenant"),
    context: AuthContext = require_auth(),
) -> str:
    """Extract tenant ID from request.
    
    Priority: X-Tenant-ID header (from gateway) > NGSILD-Tenant header > gateway context tenant_id.
    """
    if x_tenant_id:
        return x_tenant_id
    if ngsild_tenant:
        return ngsild_tenant
    if context.tenant_id:
        return context.tenant_id
    return "default"
