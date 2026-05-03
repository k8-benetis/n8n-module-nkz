/**
 * Integration Status - Layer Toggle Slot
 *
 * Quick status overview of all integrations in the layer panel.
 * Provides at-a-glance health status of connected services.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@nekazari/sdk';
import { useTranslation } from '@nekazari/sdk';
import { SlotShellCompact } from '@nekazari/viewer-kit';
import { Button, Badge, Spinner } from '@nekazari/ui-kit';
import { useModuleApi } from '@/services/api';
import {
  Workflow,
  Satellite,
  Brain,
  Bell,
  Database,
  Bot,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  ExternalLink
} from 'lucide-react';

interface IntegrationStatusProps {
  className?: string;
}

interface Integration {
  id: string;
  name: string;
  icon: React.ReactNode;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latency?: number;
}

const n8nAccent = { base: '#F43F5E', soft: '#FFE4E6', strong: '#BE123C' };

export const IntegrationStatus: React.FC<IntegrationStatusProps> = ({ className }) => {
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation('n8n');
  const api = useModuleApi();

  const [integrations, setIntegrations] = useState<Integration[]>([
    { id: 'n8n', name: 'n8n', icon: <Workflow className="w-3 h-3" />, status: 'unknown' },
    { id: 'sentinel', name: 'NDVI', icon: <Satellite className="w-3 h-3" />, status: 'unknown' },
    { id: 'intelligence', name: 'AI', icon: <Brain className="w-3 h-3" />, status: 'unknown' },
    { id: 'notifications', name: 'Alerts', icon: <Bell className="w-3 h-3" />, status: 'unknown' },
    { id: 'odoo', name: 'ERP', icon: <Database className="w-3 h-3" />, status: 'unknown' },
    { id: 'ros2', name: 'Robots', icon: <Bot className="w-3 h-3" />, status: 'unknown' },
  ]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const checkHealth = async () => {
    if (!isAuthenticated) return;

    setLoading(true);
    try {
      const healthData = await api.getIntegrationsHealth();

      setIntegrations(prev => prev.map(integration => {
        const health = healthData.find(h => h.id === integration.id);
        return {
          ...integration,
          status: health?.status || 'unknown',
          latency: health?.latency,
        };
      }));
    } catch (err) {
      console.error('[IntegrationStatus] Error checking health:', err);
      setIntegrations(prev => prev.map(i => ({ ...i, status: 'unknown' as const })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-nkz-success';
      case 'degraded': return 'bg-nkz-warning';
      case 'unhealthy': return 'bg-nkz-danger';
      default: return 'bg-nkz-border';
    }
  };

  const healthyCount = integrations.filter(i => i.status === 'healthy').length;
  const totalCount = integrations.length;

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SlotShellCompact moduleId="n8n-nkz" accent={n8nAccent}>
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-nkz-accent-soft">
            <Workflow className="w-3 h-3 text-nkz-accent-base" />
          </div>
          <span className="text-nkz-xs font-medium text-nkz-text-primary">{t('integrations.hubLabel')}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Status Dots */}
          <div className="flex items-center gap-0.5">
            {integrations.slice(0, 6).map(integration => (
              <div
                key={integration.id}
                className={`w-1.5 h-1.5 rounded-full ${getStatusColor(integration.status)}`}
                title={`${integration.name}: ${integration.status}`}
              />
            ))}
          </div>

          <span className="text-nkz-xs text-nkz-text-muted">
            {healthyCount}/{totalCount}
          </span>

          <button
            onClick={(e) => {
              e.stopPropagation();
              checkHealth();
            }}
            className="p-0.5 text-nkz-text-muted hover:text-nkz-text-secondary"
            disabled={loading}
            title={t('integrations.refreshStatus')}
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <a
            href="https://n8n.robotika.cloud"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-0.5 text-nkz-accent-base hover:text-nkz-accent-strong"
            title={t('integrations.open')}
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-nkz-border space-y-1">
          {integrations.map(integration => (
            <div
              key={integration.id}
              className="flex items-center justify-between py-1"
            >
              <div className="flex items-center gap-2">
                <span className="text-nkz-text-muted">{integration.icon}</span>
                <span className="text-nkz-xs text-nkz-text-secondary">{integration.name}</span>
              </div>
              <div className="flex items-center gap-1">
                {integration.latency && (
                  <span className="text-nkz-xs text-nkz-text-muted">{integration.latency}ms</span>
                )}
                <div className={`w-2 h-2 rounded-full ${getStatusColor(integration.status)}`} />
              </div>
            </div>
          ))}
        </div>
      )}
    </SlotShellCompact>
  );
};

export default IntegrationStatus;
