/**
 * Webhook Config Panel - Context Panel Slot
 * 
 * Provides UI to manage webhook configurations for n8n Integration Hub.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@nekazari/sdk';
import { useTranslation } from '@nekazari/sdk';
import { useUIKit } from '@/hooks/useUIKit';
import { useModuleApi } from '@/services/api';
import { WebhookConfig } from '@/types/integrations';
import { 
  Webhook, 
  Plus, 
  Trash2, 
  PlayCircle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock
} from 'lucide-react';

interface WebhookConfigPanelProps {
  className?: string;
}

export const WebhookConfigPanel: React.FC<WebhookConfigPanelProps> = ({ className }) => {
  const { Card } = useUIKit();
  const { isAuthenticated, hasAnyRole } = useAuth();
  const { t } = useTranslation('n8n');
  const api = useModuleApi();

  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Create mode
  const [isCreating, setIsCreating] = useState(false);
  const [newWebhook, setNewWebhook] = useState<Partial<WebhookConfig>>({
    name: '',
    url: '',
    
    active: true,
  });

  const canManage = hasAnyRole(['PlatformAdmin', 'TenantAdmin']);

  const loadWebhooks = async () => {
    if (!isAuthenticated || !canManage) return;
    
    setLoading(true);
    try {
      const response = await api.getWebhookConfigs();
      setWebhooks(response.webhooks || []);
      setError(null);
    } catch (err: any) {
      console.error('[WebhookConfigPanel] Error loading webhooks:', err);
      setError(err.message || t('webhooks.failedToLoad', { defaultValue: 'Error al cargar webhooks' }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWebhooks();
  }, [isAuthenticated, canManage]);

  const handleCreate = async () => {
    if (!newWebhook.name || !newWebhook.url) return;
    
    setLoading(true);
    try {
      await api.createWebhookConfig(newWebhook as Omit<WebhookConfig, 'id' | 'lastTriggered' | 'failureCount'>);
      await loadWebhooks();
      setIsCreating(false);
      setNewWebhook({ name: '', url: '', active: true });
    } catch (err: any) {
      console.error('[WebhookConfigPanel] Error creating webhook:', err);
      setError(err.message || t('webhooks.failedToCreate'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('webhooks.confirmDelete'))) return;
    
    setLoading(true);
    try {
      await api.deleteWebhookConfig(id);
      await loadWebhooks();
    } catch (err: any) {
      console.error('[WebhookConfigPanel] Error deleting webhook:', err);
      setError(err.message || t('webhooks.failedToDelete'));
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async (id: string) => {
    try {
      const result = await api.testWebhook(id);
      if (result.success) {
        alert(t('webhooks.testSuccess'));
      } else {
        alert(t('webhooks.testFailed', { error: result.error }));
      }
      await loadWebhooks(); // Refresh status
    } catch (err: any) {
      alert(t('webhooks.testFailed', { error: err.message }));
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    try {
      await api.updateWebhookConfig(id, { active: active });
      await loadWebhooks();
    } catch (err: any) {
      console.error('[WebhookConfigPanel] Error toggling webhook:', err);
      setError(err.message || t('webhooks.failedToUpdate'));
    }
  };

  if (!isAuthenticated || !canManage) {
    return null;
  }

  return (
    <Card padding="md" className={className}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-100">
            <Webhook className="w-4 h-4 text-indigo-600" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">
            {t('webhooks.title', { defaultValue: 'Webhooks' })}
          </h3>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={loadWebhooks}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
            title={t('webhooks.add')}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-red-50 text-red-700 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {isCreating && (
        <div className="p-3 mb-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t('webhooks.name', { defaultValue: 'Nombre' })}</label>
            <input
              type="text"
              value={newWebhook.name}
              onChange={(e) => setNewWebhook({ ...newWebhook, name: e.target.value })}
              className="w-full px-2 py-1.5 text-xs rounded border border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              placeholder="Ej: Odoo Sync Complete"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t('webhooks.url', { defaultValue: 'URL del Webhook (n8n)' })}</label>
            <input
              type="url"
              value={newWebhook.url}
              onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
              className="w-full px-2 py-1.5 text-xs rounded border border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              placeholder="https://n8n.robotika.cloud/webhook/..."
            />
          </div>
          <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setIsCreating(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800"
              >
                {t('common.cancel', { defaultValue: 'Cancelar' })}
              </button>
              <button
                onClick={handleCreate}
                disabled={loading || !newWebhook.name || !newWebhook.url}
                className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                {t('common.save', { defaultValue: 'Guardar' })}
              </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {webhooks.length === 0 && !loading && !isCreating ? (
          <p className="text-xs text-center text-slate-500 py-4">
            {t('webhooks.empty', { defaultValue: 'No hay webhooks configurados' })}
          </p>
        ) : (
          webhooks.map((webhook) => (
            <div key={webhook.id} className="p-3 rounded-lg border border-slate-200 bg-white hover:border-indigo-200 transition-colors group">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${webhook.active ? 'bg-green-500' : 'bg-slate-300'}`} />
                    <h4 className="text-xs font-semibold text-slate-800">{webhook.name}</h4>
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500 font-mono">
                    <span className="px-1 bg-slate-100 rounded text-slate-600"></span>
                    <span className="truncate max-w-[180px]">{webhook.url}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleTest(webhook.id)}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                    title={t('webhooks.test', { defaultValue: 'Probar' })}
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(webhook.id)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                    title={t('common.delete', { defaultValue: 'Eliminar' })}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-3 text-[10px] text-slate-500">
                  {webhook.lastTriggered ? (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(webhook.lastTriggered).toLocaleString()}
                    </span>
                  ) : (
                    <span>{t('webhooks.neverTriggered', { defaultValue: 'Nunca ejecutado' })}</span>
                  )}
                  {webhook.failureCount ? (
                    <span className="flex items-center gap-1 text-red-500" title={`${webhook.failureCount} fallos`}>
                      <XCircle className="w-3 h-3" />
                      {webhook.failureCount}
                    </span>
                  ) : webhook.lastTriggered ? (
                    <span className="flex items-center gap-1 text-green-500">
                      <CheckCircle2 className="w-3 h-3" />
                    </span>
                  ) : null}
                </div>
                
                <label className="flex items-center cursor-pointer">
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      className="sr-only" 
                      checked={webhook.active}
                      onChange={(e) => handleToggle(webhook.id, e.target.checked)}
                    />
                    <div className={`block w-7 h-4 rounded-full transition-colors ${webhook.active ? 'bg-indigo-500' : 'bg-slate-300'}`}></div>
                    <div className={`dot absolute left-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition-transform ${webhook.active ? 'transform translate-x-3' : ''}`}></div>
                  </div>
                </label>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
};

export default WebhookConfigPanel;
