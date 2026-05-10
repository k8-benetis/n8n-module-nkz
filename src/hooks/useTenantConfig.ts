import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@nekazari/sdk';
import { useModuleApi } from '@/services/api';

interface TenantConfig {
  n8n_url: string | null;
  n8n_api_key_masked: string | null;
  has_config: boolean;
}

export function useTenantConfig() {
  const { isAuthenticated, hasRole } = useAuth();
  const api = useModuleApi();

  const [config, setConfig] = useState<TenantConfig>({ n8n_url: null, n8n_api_key_masked: null, has_config: false });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string | null; latency_ms: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = hasRole('TenantAdmin') || hasRole('PlatformAdmin');

  const loadConfig = useCallback(async () => {
    if (!isAuthenticated || !isAdmin) return;
    try {
      const data = await api.getTenantConfig();
      setConfig(data);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load config');
    }
  }, [isAuthenticated, isAdmin]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const saveConfig = useCallback(async (n8n_url: string, n8n_api_key: string) => {
    setIsSaving(true);
    setError(null);
    try {
      const data = await api.saveTenantConfig({ n8n_url, n8n_api_key });
      setConfig(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to save config');
      throw e;
    } finally {
      setIsSaving(false);
    }
  }, [api]);

  const testConnection = useCallback(async (n8n_url: string, n8n_api_key: string) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await api.testN8nConnection({ n8n_url, n8n_api_key });
      setTestResult(result);
      return result;
    } catch (e: any) {
      const msg = e?.message || 'Test failed';
      setTestResult({ ok: false, message: msg, latency_ms: null });
    } finally {
      setIsTesting(false);
    }
  }, [api]);

  return {
    config,
    saveConfig,
    testConnection,
    testResult,
    isSaving,
    isTesting,
    error,
    isAdmin,
  };
}
