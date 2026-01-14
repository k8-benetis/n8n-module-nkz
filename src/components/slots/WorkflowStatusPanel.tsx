/**
 * Workflow Status Panel - Context Panel Slot
 * 
 * Shows workflow status and actions related to the selected entity.
 * Displays active workflows, recent executions, and quick actions.
 */

import React, { useState, useEffect } from 'react';
import { useViewer, useAuth } from '@nekazari/sdk';
import { useUIKit } from '@/hooks/useUIKit';
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

export const WorkflowStatusPanel: React.FC<WorkflowStatusPanelProps> = ({ className }) => {
  const { Card, Button } = useUIKit();
  const { selectedEntityId, selectedEntityType } = useViewer();
  const { isAuthenticated, hasRole } = useAuth();
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
        // Transform and filter workflows related to entity
        const summaries: WorkflowSummary[] = (response.workflows || []).map(w => ({
          id: w.id,
          name: w.name,
          active: w.active,
          lastExecution: undefined, // Would come from executions API
          relatedToEntity: w.name.toLowerCase().includes(selectedEntityType?.toLowerCase() || '')
        }));
        setWorkflows(summaries);
      } catch (err: any) {
        console.error('[WorkflowStatusPanel] Error:', err);
        setError(err.message || 'Failed to load workflows');
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
      // Refresh workflows after execution
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
      setError(err.message || 'Failed to execute workflow');
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'success': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'running': return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  if (!isAuthenticated) {
    return (
      <Card padding="md" className={className}>
        <div className="flex items-center gap-2 text-amber-600">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">Login required</span>
        </div>
      </Card>
    );
  }

  if (!selectedEntityId) {
    return (
      <Card padding="md" className={className}>
        <div className="flex items-center gap-2 text-gray-500">
          <Workflow className="w-5 h-5" />
          <span className="text-sm">Select an entity to see workflows</span>
        </div>
      </Card>
    );
  }

  const relatedWorkflows = workflows.filter(w => w.relatedToEntity || w.active);

  return (
    <Card padding="md" className={className}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-orange-100">
              <Workflow className="w-4 h-4 text-orange-600" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">
              n8n Workflows
            </h3>
          </div>
          <a
            href="https://n8n.nekazari.artotxiki.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-orange-600 hover:text-orange-700 flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            Open n8n
          </a>
        </div>

        {/* Entity Context */}
        <div className="text-xs bg-slate-50 rounded p-2">
          <div className="flex justify-between">
            <span className="text-slate-500">Entity:</span>
            <span className="text-slate-700 font-mono truncate max-w-[150px]">
              {selectedEntityId}
            </span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-slate-500">Type:</span>
            <span className="text-slate-700">{selectedEntityType || 'Unknown'}</span>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded p-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-xs">{error}</span>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="w-5 h-5 text-orange-500 animate-spin" />
          </div>
        )}

        {/* Workflows List */}
        {!loading && relatedWorkflows.length === 0 && (
          <div className="text-sm text-slate-500 text-center py-4">
            No active workflows for this entity type.
          </div>
        )}

        {!loading && relatedWorkflows.length > 0 && (
          <div className="space-y-2">
            {relatedWorkflows.slice(0, 5).map(workflow => (
              <div
                key={workflow.id}
                className="flex items-center justify-between p-2 bg-slate-50 rounded hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {getStatusIcon(workflow.lastExecution?.status)}
                  <span className="text-sm text-slate-700 truncate">
                    {workflow.name}
                  </span>
                </div>
                {hasRole('TenantAdmin') && workflow.active && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => executeWorkflow(workflow.id)}
                    className="p-1 flex-shrink-0"
                    title="Execute workflow"
                  >
                    <Zap className="w-4 h-4 text-orange-500" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Quick Actions */}
        {hasRole('TenantAdmin') && (
          <div className="pt-2 border-t border-slate-200">
            <p className="text-xs text-slate-500 mb-2">Quick Actions</p>
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
                className="text-xs flex-1"
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
                className="text-xs flex-1"
              >
                <Zap className="w-3 h-3 mr-1" />
                Predict
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default WorkflowStatusPanel;
