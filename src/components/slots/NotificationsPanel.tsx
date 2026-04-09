/**
 * Notifications Panel - Context Panel Slot
 * 
 * Provides UI to manage notification templates and test channels.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@nekazari/sdk';
import { useTranslation } from '@nekazari/sdk';
import { useUIKit } from '@/hooks/useUIKit';
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

export const NotificationsPanel: React.FC<NotificationsPanelProps> = ({ className }) => {
  const { Card } = useUIKit();
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
    
    // Reset status message after 3 seconds
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
    <Card padding="md" className={className}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-orange-100">
            <Bell className="w-4 h-4 text-orange-600" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">
            {t('notifications.title', { defaultValue: 'Notificaciones' })}
          </h3>
        </div>
        
        <button
          onClick={loadTemplates}
          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-red-50 text-red-700 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Test Channel Section */}
      <div className="p-3 mb-4 rounded-lg bg-slate-50 border border-slate-200">
        <h4 className="text-xs font-semibold text-slate-700 mb-2">{t('notifications.testTitle', { defaultValue: 'Probar Canal' })}</h4>
        <div className="space-y-2">
          <div className="flex gap-2">
            <select
              value={testChannel}
              onChange={(e) => setTestChannel(e.target.value)}
              className="px-2 py-1.5 text-xs rounded border border-slate-300 focus:border-orange-500 outline-none bg-white min-w-[100px]"
            >
              <option value="email">Email</option>
              <option value="telegram">Telegram</option>
              <option value="sms">SMS</option>
            </select>
            <input
              type="text"
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              className="flex-1 px-2 py-1.5 text-xs rounded border border-slate-300 focus:border-orange-500 outline-none"
              placeholder={testChannel === 'email' ? 'ejemplo@correo.com' : 'ID o Teléfono'}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <div className="text-[10px]">
              {testStatus === 'success' && <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {testResultMsg}</span>}
              {testStatus === 'error' && <span className="text-red-600 flex items-center gap-1"><XCircle className="w-3 h-3" /> {testResultMsg}</span>}
            </div>
            <button
              onClick={handleTestChannel}
              disabled={testStatus === 'testing' || !testRecipient}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-orange-600 rounded hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {testStatus === 'testing' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              {t('notifications.sendTest', { defaultValue: 'Enviar Prueba' })}
            </button>
          </div>
        </div>
      </div>

      {/* Templates List */}
      <div>
        <h4 className="text-xs font-semibold text-slate-700 mb-2">{t('notifications.templates', { defaultValue: 'Plantillas de Mensaje' })}</h4>
        <div className="space-y-2">
          {templates.length === 0 && !loading ? (
            <p className="text-xs text-center text-slate-500 py-2">
              {t('notifications.noTemplates', { defaultValue: 'No hay plantillas configuradas' })}
            </p>
          ) : (
            templates.map((template, idx) => (
              <div key={idx} className="p-2.5 rounded-lg border border-slate-200 bg-white flex items-center justify-between">
                <div>
                  <h5 className="text-xs font-medium text-slate-800">{template.name}</h5>
                  <p className="text-[10px] text-slate-500 truncate max-w-[200px] mt-0.5">{template.description}</p>
                </div>
                <div className="flex items-center gap-1">
                  {template.channels?.map((ch: string) => (
                    <div key={ch} className="p-1 bg-slate-100 rounded text-slate-500" title={ch}>
                      {getChannelIcon(ch)}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
};

export default NotificationsPanel;
