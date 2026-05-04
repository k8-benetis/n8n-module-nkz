/**
 * Webhook Config Panel - Context Panel Slot
 *
 * Provides UI to manage webhook configurations for n8n Integration Hub.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@nekazari/sdk';
import { useTranslation } from '@nekazari/sdk';
import { SlotShell } from './SlotShell';
import { Button, Badge, Stack, Input, IconButton } from '@nekazari/ui-kit';
import { useModuleApi } from '@/services/api';
import { WebhookConfig } from '@/types/integrations';
import {
  Webhook,
  Plus,
  Trash2,
  PlayCircle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock
} from 'lucide-react';

interface WebhookConfigPanelProps {
  className?: string;
}

const n8nAccent = { base: '#F43F5E', soft: '#FFE4E6', strong: '#BE123C' };

export const WebhookConfigPanel: React.FC<WebhookConfigPanelProps> = ({ className: _className }) => {
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
      await loadWebhooks();
    } catch (err: any) {
      alert(t('webhooks.testFailed', { error: err.message }));
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    try {
      await api.updateWebhookConfig(id, { active });
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
    <SlotShell
      title={t('webhooks.title', { defaultValue: 'Webhooks' })}
      icon={<Webhook className="w-4 h-4" />}
      collapsible
      accent={n8nAccent}
    >
      <Stack gap="stack">
        {error && (
          <Badge intent="negative" className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-nkz-xs">{error}</span>
          </Badge>
        )}

        {/* Create Form */}
        {isCreating && (
          <div className="bg-nkz-surface-sunken rounded-nkz-md p-nkz-stack border border-nkz-border">
            <Stack gap="stack">
              <Input
                value={newWebhook.name}
                onChange={(e) => setNewWebhook({ ...newWebhook, name: e.target.value })}
                placeholder={t('webhooks.name', { defaultValue: 'Nombre' })}
                size="sm"
              />
              <Input
                value={newWebhook.url}
                onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
                placeholder={t('webhooks.url', { defaultValue: 'URL del Webhook (n8n)' })}
                size="sm"
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCreating(false)}
                >
                  {t('common.cancel', { defaultValue: 'Cancelar' })}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCreate}
                  disabled={loading || !newWebhook.name || !newWebhook.url}
                >
                  {t('common.save', { defaultValue: 'Guardar' })}
                </Button>
              </div>
            </Stack>
          </div>
        )}

        {/* Webhooks List */}
        <Stack gap="tight">
          {webhooks.length === 0 && !loading && !isCreating ? (
            <p className="text-nkz-xs text-center text-nkz-text-muted py-nkz-stack">
              {t('webhooks.empty', { defaultValue: 'No hay webhooks configurados' })}
            </p>
          ) : (
            webhooks.map((webhook) => (
              <div key={webhook.id} className="p-nkz-stack rounded-nkz-lg border border-nkz-border bg-nkz-surface hover:border-nkz-accent-base transition-colors group">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${webhook.active ? 'bg-nkz-success' : 'bg-nkz-border'}`} />
                      <h4 className="text-nkz-xs font-semibold text-nkz-text-primary">{webhook.name}</h4>
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-nkz-xs text-nkz-text-muted font-mono">
                      <span className="truncate max-w-[180px]">{webhook.url}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <IconButton
                      aria-label={t('webhooks.test', { defaultValue: 'Probar' })}
                      size="sm"
                      onClick={() => handleTest(webhook.id)}
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                    </IconButton>
                    <IconButton
                      aria-label={t('common.delete', { defaultValue: 'Eliminar' })}
                      size="sm"
                      onClick={() => handleDelete(webhook.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </IconButton>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-nkz-border">
                  <div className="flex items-center gap-3 text-nkz-xs text-nkz-text-muted">
                    {webhook.lastTriggered ? (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(webhook.lastTriggered).toLocaleString()}
                      </span>
                    ) : (
                      <span>{t('webhooks.neverTriggered', { defaultValue: 'Nunca ejecutado' })}</span>
                    )}
                    {webhook.failureCount ? (
                      <span className="flex items-center gap-1 text-nkz-danger">
                        <XCircle className="w-3 h-3" />
                        {webhook.failureCount}
                      </span>
                    ) : webhook.lastTriggered ? (
                      <span className="flex items-center gap-1 text-nkz-success">
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
                      <div className={`block w-7 h-4 rounded-full transition-colors ${webhook.active ? 'bg-nkz-accent-base' : 'bg-nkz-border'}`} />
                      <div className={`dot absolute left-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition-transform ${webhook.active ? 'transform translate-x-3' : ''}`} />
                    </div>
                  </label>
                </div>
              </div>
            ))
          )}
        </Stack>

        {/* Add Webhook Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCreating(!isCreating)}
          leadingIcon={<Plus className="w-4 h-4" />}
        >
          {t('webhooks.add')}
        </Button>
      </Stack>
    </SlotShell>
  );
};

export default WebhookConfigPanel;
