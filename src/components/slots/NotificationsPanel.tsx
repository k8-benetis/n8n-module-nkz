/**
 * Notifications Panel - Context Panel Slot
 *
 * Provides UI to manage notification templates and test channels.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@nekazari/sdk';
import { useTranslation } from '@nekazari/sdk';
import { SlotShell } from '@nekazari/viewer-kit';
import { Button, Badge, Spinner, Stack, Select, Input } from '@nekazari/ui-kit';
import { useModuleApi } from '@/services/api';
import {
  Bell,
  Send,
  Mail,
  MessageSquare,
  Smartphone,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle
} from 'lucide-react';

interface NotificationsPanelProps {
  className?: string;
}

const n8nAccent = { base: '#F43F5E', soft: '#FFE4E6', strong: '#BE123C' };

export const NotificationsPanel: React.FC<NotificationsPanelProps> = ({ className }) => {
  const { isAuthenticated, hasAnyRole } = useAuth();
  const { t } = useTranslation('n8n');
  const api = useModuleApi();

  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Test notification state
  const [testChannel, setTestChannel] = useState<string>('email');
  const [testRecipient, setTestRecipient] = useState<string>('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testResultMsg, setTestResultMsg] = useState<string>('');

  const canManage = hasAnyRole(['PlatformAdmin', 'TenantAdmin']);

  const loadTemplates = async () => {
    if (!isAuthenticated || !canManage) return;

    setLoading(true);
    try {
      const response = await api.getNotificationTemplates();
      setTemplates(response.templates || []);
      setError(null);
    } catch (err: any) {
      console.error('[NotificationsPanel] Error loading templates:', err);
      setError(err.message || t('notifications.failedToLoad'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, [isAuthenticated, canManage]);

  const handleTestChannel = async () => {
    if (!testRecipient) {
      alert(t('notifications.recipientRequired', { defaultValue: 'El destinatario es obligatorio' }));
      return;
    }

    setTestStatus('testing');
    try {
      await api.testNotificationChannel(testChannel, testRecipient);
      setTestStatus('success');
      setTestResultMsg(t('notifications.testSuccess', { defaultValue: 'Notificación enviada correctamente' }));
    } catch (err: any) {
      console.error('[NotificationsPanel] Error testing channel:', err);
      setTestStatus('error');
      setTestResultMsg(err.message || t('notifications.testFailed', { defaultValue: 'Fallo al enviar notificación' }));
    }

    setTimeout(() => {
      if (testStatus !== 'testing') {
        setTestStatus('idle');
      }
    }, 3000);
  };

  const getChannelIcon = (channel: string) => {
    switch (channel.toLowerCase()) {
      case 'email': return <Mail className="w-3.5 h-3.5" />;
      case 'telegram': return <MessageSquare className="w-3.5 h-3.5" />;
      case 'sms': return <Smartphone className="w-3.5 h-3.5" />;
      default: return <Bell className="w-3.5 h-3.5" />;
    }
  };

  if (!isAuthenticated || !canManage) {
    return null;
  }

  return (
    <SlotShell
      title={t('notifications.title', { defaultValue: 'Notificaciones' })}
      icon={<Bell className="w-4 h-4" />}
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

        {/* Test Channel Section */}
        <div className="bg-nkz-surface-sunken rounded-nkz-md p-nkz-stack border border-nkz-border">
          <Stack gap="stack">
            <h4 className="text-nkz-sm font-semibold text-nkz-text-primary">
              {t('notifications.testTitle', { defaultValue: 'Probar Canal' })}
            </h4>
            <div className="flex gap-2">
              <Select
                value={testChannel}
                onChange={(v) => setTestChannel(v as string)}
                options={[
                  { value: 'email', label: 'Email' },
                  { value: 'telegram', label: 'Telegram' },
                  { value: 'sms', label: 'SMS' },
                ]}
                size="sm"
              />
              <Input
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder={testChannel === 'email' ? 'ejemplo@correo.com' : 'ID o Teléfono'}
                size="sm"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="text-nkz-xs">
                {testStatus === 'success' && (
                  <span className="text-nkz-success flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {testResultMsg}
                  </span>
                )}
                {testStatus === 'error' && (
                  <span className="text-nkz-danger flex items-center gap-1">
                    <XCircle className="w-3 h-3" /> {testResultMsg}
                  </span>
                )}
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={handleTestChannel}
                disabled={testStatus === 'testing' || !testRecipient}
                leadingIcon={testStatus === 'testing' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              >
                {t('notifications.sendTest', { defaultValue: 'Enviar Prueba' })}
              </Button>
            </div>
          </Stack>
        </div>

        {/* Templates List */}
        <div>
          <h4 className="text-nkz-sm font-semibold text-nkz-text-primary mb-nkz-inline">
            {t('notifications.templates', { defaultValue: 'Plantillas de Mensaje' })}
          </h4>
          <Stack gap="tight">
            {templates.length === 0 && !loading ? (
              <p className="text-nkz-xs text-center text-nkz-text-muted py-nkz-inline">
                {t('notifications.noTemplates', { defaultValue: 'No hay plantillas configuradas' })}
              </p>
            ) : (
              templates.map((template, idx) => (
                <div key={idx} className="p-nkz-inline rounded-nkz-lg border border-nkz-border bg-nkz-surface flex items-center justify-between">
                  <div>
                    <h5 className="text-nkz-xs font-medium text-nkz-text-primary">{template.name}</h5>
                    <p className="text-nkz-xs text-nkz-text-muted truncate max-w-[200px] mt-0.5">{template.description}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {template.channels?.map((ch: string) => (
                      <div key={ch} className="p-1 bg-nkz-surface-sunken rounded text-nkz-text-muted" title={ch}>
                        {getChannelIcon(ch)}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </Stack>
        </div>
      </Stack>
    </SlotShell>
  );
};

export default NotificationsPanel;
