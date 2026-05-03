/**
 * Execution Monitor - Bottom Panel Slot
 *
 * Timeline view of workflow executions with filtering and details.
 * Shows real-time execution status and history.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@nekazari/sdk';
import { useTranslation } from '@nekazari/sdk';
import { SlotShell } from '@nekazari/viewer-kit';
import { Button, Badge, Spinner, Stack, Select, Toggle } from '@nekazari/ui-kit';
import { useModuleApi } from '@/services/api';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  AlertCircle,
  Filter,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from 'lucide-react';

interface ExecutionMonitorProps {
  className?: string;
}

interface ExecutionItem {
  id: string;
  workflowId: string;
  workflowName: string;
  status: 'success' | 'error' | 'running' | 'waiting';
  startedAt: string;
  duration?: number;
  mode: string;
}

const n8nAccent = { base: '#F43F5E', soft: '#FFE4E6', strong: '#BE123C' };

export const ExecutionMonitor: React.FC<ExecutionMonitorProps> = ({ className }) => {
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation('n8n');
  const api = useModuleApi();

  const [executions, setExecutions] = useState<ExecutionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch executions
  const fetchExecutions = async () => {
    if (!isAuthenticated) return;

    setLoading(true);
    try {
      await api.getExecutions({
        status: filter !== 'all' ? filter : undefined,
        limit: expanded ? 50 : 10
      });

      // Mock data for demo - would come from actual API
      const mockExecutions: ExecutionItem[] = [
        {
          id: '1',
          workflowId: 'wf-1',
          workflowName: 'NDVI Alert Pipeline',
          status: 'success',
          startedAt: new Date(Date.now() - 5*60*1000).toISOString(),
          duration: 3200,
          mode: 'trigger'
        },
        {
          id: '2',
          workflowId: 'wf-2',
          workflowName: 'Production Prediction',
          status: 'running',
          startedAt: new Date(Date.now() - 2*60*1000).toISOString(),
          mode: 'webhook'
        },
        {
          id: '3',
          workflowId: 'wf-3',
          workflowName: 'Pest Detection',
          status: 'success',
          startedAt: new Date(Date.now() - 15*60*1000).toISOString(),
          duration: 8500,
          mode: 'cron'
        },
        {
          id: '4',
          workflowId: 'wf-1',
          workflowName: 'NDVI Alert Pipeline',
          status: 'error',
          startedAt: new Date(Date.now() - 30*60*1000).toISOString(),
          duration: 1200,
          mode: 'trigger'
        },
        {
          id: '5',
          workflowId: 'wf-4',
          workflowName: 'Risk Notifications',
          status: 'success',
          startedAt: new Date(Date.now() - 60*60*1000).toISOString(),
          duration: 4500,
          mode: 'cron'
        },
      ];

      setExecutions(mockExecutions.filter(e =>
        filter === 'all' || e.status === filter
      ));
      setError(null);
    } catch (err: any) {
      console.error('[ExecutionMonitor] Error:', err);
      setError(err.message || t('executions.failedToLoad'));
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchExecutions();

    if (autoRefresh) {
      const interval = setInterval(fetchExecutions, 10000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, filter, expanded, autoRefresh]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle2 className="w-4 h-4 text-nkz-success" />;
      case 'error': return <XCircle className="w-4 h-4 text-nkz-danger" />;
      case 'running': return <RefreshCw className="w-4 h-4 text-nkz-info animate-spin" />;
      case 'waiting': return <Clock className="w-4 h-4 text-nkz-warning" />;
      default: return <Clock className="w-4 h-4 text-nkz-text-muted" />;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'success': return 'bg-nkz-success-soft';
      case 'error': return 'bg-nkz-danger-soft';
      case 'running': return 'bg-nkz-info-soft';
      case 'waiting': return 'bg-nkz-warning-soft';
      default: return 'bg-nkz-surface-sunken';
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
    return `${(ms/60000).toFixed(1)}m`;
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  if (!isAuthenticated) {
    return (
      <SlotShell moduleId="n8n-nkz" accent={n8nAccent}>
        <div className="flex items-center gap-2 text-nkz-warning">
          <AlertCircle className="w-4 h-4" />
          <span className="text-nkz-xs">{t('common.loginRequired')}</span>
        </div>
      </SlotShell>
    );
  }

  const runningCount = executions.filter(e => e.status === 'running').length;
  const errorCount = executions.filter(e => e.status === 'error').length;

  return (
    <SlotShell
      title={t('executions.title')}
      icon={<Activity className="w-4 h-4" />}
      collapsible
      accent={n8nAccent}
    >
      <Stack gap="stack">
        {/* Status Summary */}
        <div className="flex items-center gap-2">
          {runningCount > 0 && (
            <Badge intent="info" className="flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" />
              {t('executions.running', { count: runningCount })}
            </Badge>
          )}
          {errorCount > 0 && (
            <Badge intent="negative" className="flex items-center gap-1">
              <XCircle className="w-3 h-3" />
              {t('executions.errors', { count: errorCount })}
            </Badge>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <Select
            value={filter}
            onChange={(v) => setFilter(v as string)}
            options={[
              { value: 'all', label: t('executions.filter.all') },
              { value: 'success', label: t('executions.filter.success') },
              { value: 'error', label: t('executions.filter.error') },
              { value: 'running', label: t('executions.filter.running') },
            ]}
            size="sm"
          />

          <div className="flex items-center gap-2">
            <Toggle
              checked={autoRefresh}
              onChange={setAutoRefresh}
              label=""
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              leadingIcon={expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            >
              {expanded ? t('executions.collapse') : t('executions.expand')}
            </Button>
            <a
              href="https://n8n.robotika.cloud"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-nkz-accent-base hover:text-nkz-accent-strong"
              title={t('app.openN8n')}
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Error */}
        {error && (
          <Badge intent="negative" className="flex items-center gap-2">
            <AlertCircle className="w-3 h-3" />
            <span className="text-nkz-xs">{error}</span>
          </Badge>
        )}

        {/* Executions Timeline */}
        <div className={`overflow-x-auto ${expanded ? 'max-h-64' : 'max-h-32'} overflow-y-auto`}>
          {loading && executions.length === 0 ? (
            <div className="flex items-center justify-center py-4">
              <Spinner size="md" />
            </div>
          ) : executions.length === 0 ? (
            <div className="text-nkz-xs text-nkz-text-muted text-center py-4">
              {t('executions.noExecutionsFound')}
            </div>
          ) : (
            <div className="flex gap-2 pb-2">
              {executions.map(execution => (
                <div
                  key={execution.id}
                  className={`flex-shrink-0 p-nkz-inline rounded-nkz-lg ${getStatusBg(execution.status)} min-w-[140px] cursor-pointer hover:opacity-80 transition-opacity`}
                  title={`${execution.workflowName}\nStarted: ${new Date(execution.startedAt).toLocaleString()}\nDuration: ${formatDuration(execution.duration)}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {getStatusIcon(execution.status)}
                    <span className="text-nkz-xs text-nkz-text-secondary">{formatTime(execution.startedAt)}</span>
                  </div>
                  <p className="text-nkz-xs font-medium text-nkz-text-primary truncate">
                    {execution.workflowName}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-nkz-xs text-nkz-text-muted uppercase">{execution.mode}</span>
                    <span className="text-nkz-xs text-nkz-text-muted">{formatDuration(execution.duration)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Stack>
    </SlotShell>
  );
};

export default ExecutionMonitor;
