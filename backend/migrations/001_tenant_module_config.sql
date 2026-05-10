-- =============================================================================
-- Per-tenant module configuration (n8n-nkz Phase 1)
-- =============================================================================
-- Uses admin_platform schema (same as tenant_limits).
-- JSONB config column allows future keys without migration.
-- =============================================================================

CREATE TABLE IF NOT EXISTS admin_platform.tenant_module_config (
    tenant_id   TEXT NOT NULL,
    module_id   TEXT NOT NULL DEFAULT 'n8n-nkz',
    config      JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (tenant_id, module_id)
);
