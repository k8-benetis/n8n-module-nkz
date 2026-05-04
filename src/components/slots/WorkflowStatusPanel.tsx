/**
 * Workflow Status Panel - Context Panel Slot
 *
 * Shows workflow status and actions related to the selected entity.
 * Displays active workflows, recent executions, and quick actions.
 */

import React, { useState, useEffect } from 'react';
import { useViewer, useAuth } from '@nekazari/sdk';
import { useTranslation } from '@nekazari/sdk';
import { SlotShell } from './SlotShell';
import { Button, Badge, Spinner, Stack } from '@nekazari/ui-kit';
import { useModuleApi } from '@/services/api';
import {
  Workflow,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Zap
} from 'lucide-react';

interface WorkflowStatusPanelProps {
  className?: string;
}

interface WorkflowSummary {
  id: string;
  name: string;
  active: boolean;
  lastExecution?: {
    status: 'success' | 'error' | 'running';
    date: string;
  };
  relatedToEntity: boolean;
}

const n8nAccent = { base: '#F43F5E', soft: '#FFE4E6', strong: '#BE123C' };

export const WorkflowStatusPanel: React.FC<WorkflowStatusPanelProps> = ({ className: _className }) => {
  const { selectedEntityId, selectedEntityType } = useViewer();
  const { isAuthenticated, hasRole } = useAuth();
  const { t } = useTranslation('n8n');
  const api = useModuleApi();

  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch workflows on mount and when entity changes
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchWorkflows = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.getWorkflows();
        const summaries: WorkflowSummary[] = (response.workflows || []).map(w => ({
          id: w.id,
          name: w.name,
          active: w.active,
          lastExecution: undefined,
          relatedToEntity: w.name.toLowerCase().includes(selectedEntityType?.toLowerCase() || '')
        }));
        setWorkflows(summaries);
      } catch (err: any) {
        console.error('[WorkflowStatusPanel] Error:', err);
        setError(err.message || t('workflows.failedToLoad'));
      } finally {
        setLoading(false);
      }
    };

    fetchWorkflows();
  }, [isAuthenticated, selectedEntityId, selectedEntityType]);

  const executeWorkflow = async (workflowId: string) => {
    if (!selectedEntityId) return;

    try {
      await api.executeWorkflow(workflowId, {
        entityId: selectedEntityId,
        entityType: selectedEntityType,
      });
      setLoading(true);
      const response = await api.getWorkflows();
      setWorkflows(response.workflows?.map(w => ({
        id: w.id,
        name: w.name,
        active: w.active,
        relatedToEntity: w.name.toLowerCase().includes(selectedEntityType?.toLowerCase() || '')
      })) || []);
      setLoading(false);
    } catch (err: any) {
      setError(err.message || t('workflows.failedToExecute'));
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'success': return <CheckCircle2 className="w-4 h-4 text-nkz-success" />;
      case 'error': return <XCircle className="w-4 h-4 text-nkz-danger" />;
      case 'running': return <RefreshCw className="w-4 h-4 text-nkz-info animate-spin" />;
      default: return <Clock className="w-4 h-4 text-nkz-text-muted" />;
    }
  };

  if (!isAuthenticated) {
    return (
      <SlotShell moduleId="n8n-nkz" accent={n8nAccent}>
        <div className="flex items-center gap-2 text-nkz-warning">
          <AlertCircle className="w-5 h-5" />
          <span className="text-nkz-sm">{t('common.loginRequired')}</span>
        </div>
      </SlotShell>
    );
  }

  if (!selectedEntityId) {
    return (
      <SlotShell moduleId="n8n-nkz" accent={n8nAccent}>
        <div className="flex items-center gap-2 text-nkz-text-muted">
          <Workflow className="w-5 h-5" />
          <span className="text-nkz-sm">{t('common.selectEntityToSeeWorkflows')}</span>
        </div>
      </SlotShell>
    );
  }

  const relatedWorkflows = workflows.filter(w => w.relatedToEntity || w.active);

  return (
    <SlotShell
      title={t('workflows.title')}
      icon={<Workflow className="w-4 h-4" />}
      collapsible
      accent={n8nAccent}
    >
      <Stack gap="stack">
        {/* Entity Context */}
        <div className="bg-nkz-surface-sunken rounded-nkz-md p-nkz-inline">
          <div className="flex justify-between">
            <span className="text-nkz-xs text-nkz-text-muted">{t('common.entity')}:</span>
            <span className="text-nkz-xs text-nkz-text-primary font-mono truncate max-w-[150px]">
              {selectedEntityId}
            </span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-nkz-xs text-nkz-text-muted">{t('common.type')}:</span>
            <span className="text-nkz-xs text-nkz-text-primary">{selectedEntityType || t('common.unknown')}</span>
          </div>
        </div>

        {/* External Link */}
        <a
          href="https://n8n.robotika.cloud"
          target="_blank"
          rel="noopener noreferrer"
          className="text-nkz-xs text-nkz-accent-base hover:text-nkz-accent-strong flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" />
          {t('app.openN8n')}
        </a>

        {/* Error State */}
        {error && (
          <Badge intent="negative" className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-nkz-xs">{error}</span>
          </Badge>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-4">
            <Spinner size="md" />
          </div>
        )}

        {/* Workflows List */}
        {!loading && relatedWorkflows.length === 0 && (
          <div className="text-nkz-sm text-nkz-text-muted text-center py-4">
            {t('workflows.noActiveForEntityType')}
          </div>
        )}

        {!loading && relatedWorkflows.length > 0 && (
          <Stack gap="tight">
            {relatedWorkflows.slice(0, 5).map(workflow => (
              <div
                key={workflow.id}
                className="flex items-center justify-between p-nkz-inline bg-nkz-surface-sunken rounded-nkz-md hover:bg-nkz-surface transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {getStatusIcon(workflow.lastExecution?.status)}
                  <span className="text-nkz-sm text-nkz-text-primary truncate">
                    {workflow.name}
                  </span>
                </div>
                {hasRole('TenantAdmin') && workflow.active && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => executeWorkflow(workflow.id)}
                    leadingIcon={<Zap className="w-4 h-4" />}
                    className="flex-shrink-0"
                  >
                    {t('workflows.executeWorkflow')}
                  </Button>
                )}
              </div>
            ))}
          </Stack>
        )}

        {/* Quick Actions */}
        {hasRole('TenantAdmin') && (
          <div className="pt-nkz-stack border-t border-nkz-border">
            <p className="text-nkz-xs text-nkz-text-muted mb-nkz-inline">{t('workflows.quickActions')}</p>
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => api.requestAnalysis({
                  parcelId: selectedEntityId!,
                  startDate: new Date(Date.now() - 30*24*60*60*1000).toISOString(),
                  endDate: new Date().toISOString(),
                  indices: ['NDVI']
                })}
                className="flex-1"
              >
                <Play className="w-3 h-3 mr-1" />
                NDVI Analysis
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => api.requestPrediction({
                  type: 'production',
                  entityId: selectedEntityId!,
                  entityType: selectedEntityType!
                })}
                className="flex-1"
              >
                <Zap className="w-3 h-3 mr-1" />
                Predict
              </Button>
            </div>
          </div>
        )}
      </Stack>
    </SlotShell>
  );
};

export default WorkflowStatusPanel;
