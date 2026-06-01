import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@nekazari/sdk';
import { useModuleApi } from '@/services/api';

interface TenantConfig {
  n8n_url: string | null;
  n8n_api_key_masked: string | null;
  has_config: boolean;
}

interface ProvisionStatus {
  status: "none" | "in_progress" | "active" | "suspended" | "grace_period" | "error";
  n8n_url: string | null;
  username: string | null;
  password: string | null;
  suspended_at: string | null;
  days_remaining: number | null;
  is_enterprise: boolean;
}

export function useTenantConfig() {
  const { isAuthenticated, hasRole } = useAuth();
  const api = useModuleApi();

  const [config, setConfig] = useState<TenantConfig>({ n8n_url: null, n8n_api_key_masked: null, has_config: false });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string | null; latency_ms: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provisionStatus, setProvisionStatus] = useState<ProvisionStatus>({
    status: "none", n8n_url: null, username: null, password: null,
    suspended_at: null, days_remaining: null, is_enterprise: false,
  });
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  const isAdmin = hasRole('TenantAdmin') || hasRole('PlatformAdmin');

  // Use refs so callbacks always have access to latest values without triggering re-renders
  const apiRef = useRef(api);
  apiRef.current = api;
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;
  const isAdminRef = useRef(isAdmin);
  isAdminRef.current = isAdmin;

  const loadConfig = useCallback(async () => {
    if (!isAuthenticatedRef.current || !isAdminRef.current) return;
    try {
      const data = await apiRef.current.getTenantConfig();
      setConfig(data);
      setError(null);
    } catch (e: any) {
      // Silent
    }
  }, []);

  // Load config once on mount (refs keep values fresh)
  useEffect(() => {
    loadConfig();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveConfig = useCallback(async (n8n_url: string, n8n_api_key: string) => {
    setIsSaving(true);
    setError(null);
    try {
      const data = await apiRef.current.saveTenantConfig({ n8n_url, n8n_api_key });
      setConfig(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to save config');
      throw e;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const testConnection = useCallback(async (n8n_url: string, n8n_api_key: string) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await apiRef.current.testN8nConnection({ n8n_url, n8n_api_key });
      setTestResult(result);
      return result;
    } catch (e: any) {
      const msg = e?.message || 'Test failed';
      setTestResult({ ok: false, message: msg, latency_ms: null });
    } finally {
      setIsTesting(false);
    }
  }, []);

  // Poll provision status every 10s using refs to avoid dependency loops
  useEffect(() => {
    const poll = async () => {
      if (!isAuthenticatedRef.current) return;
      try {
        const data = await apiRef.current.getProvisionStatus() as ProvisionStatus;
        setProvisionStatus(data);
        setProvisionError(null);
      } catch (e: any) {
        // Silent — don't spam on rate limits or auth failures
      }
    };

    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, []); // Only mount/unmount — refs keep values fresh

  const startProvision = useCallback(async () => {
    setIsProvisioning(true);
    setProvisionError(null);
    try {
      const result = await apiRef.current.provisionN8n();
      if (result.checkout_url) {
        window.location.href = result.checkout_url;
        return;
      }
      setProvisionStatus(prev => ({ ...prev, status: "in_progress" }));
    } catch (e: any) {
      setProvisionError(e?.message || 'Failed to start provisioning');
    } finally {
      setIsProvisioning(false);
    }
  }, []);

  const cancelSubscription = useCallback(async () => {
    setProvisionError(null);
    try {
      await apiRef.current.cancelN8nProvision();
      const data = await apiRef.current.getProvisionStatus() as ProvisionStatus;
      setProvisionStatus(data);
    } catch (e: any) {
      setProvisionError(e?.message || 'Failed to cancel');
    }
  }, []);

  const loadProvisionStatusManually = useCallback(async () => {
    if (!isAuthenticatedRef.current) return;
    try {
      const data = await apiRef.current.getProvisionStatus() as ProvisionStatus;
      setProvisionStatus(data);
      setProvisionError(null);
    } catch (e: any) {
      setProvisionError(e?.message || 'Failed to load status');
    }
  }, []);

  return {
    config,
    saveConfig,
    testConnection,
    testResult,
    isSaving,
    isTesting,
    error,
    isAdmin,
    provisionStatus,
    isProvisioning,
    provisionError,
    startProvision,
    cancelSubscription,
    loadProvisionStatus: loadProvisionStatusManually,
  };
}
