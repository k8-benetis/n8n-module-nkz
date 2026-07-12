/**
 * n8n Integration Hub - Main App Component
 * 
 * This module provides workflow orchestration capabilities connecting n8n
 * with Nekazari platform services including:
 * - Sentinel/NDVI satellite analysis
 * - AI predictions (production, pests)
 * - Multi-channel notifications
 * - Odoo ERP synchronization
 * - ROS2 agricultural robotics
 */

import React, { useState } from 'react';
import { 
  Workflow, 
  Satellite, 
  Brain, 
  Bell, 
  Database, 
  Bot, 
  Play, 
  Pause,
  RefreshCw,
  Settings,
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  Info
} from 'lucide-react';
import { useTranslation } from '@nekazari/sdk';
import { useN8nUrl } from './hooks/useN8nUrl';
import { useTenantConfig } from './hooks/useTenantConfig';
import './i18n';

// Export viewerSlots for host integration
export { viewerSlots } from './slots/index';

// Integration status type
interface IntegrationStatus {
  id: string;
  name: string;
  icon: React.ReactNode;
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  lastSync?: string;
  description: string;
}

// Workflow type
interface WorkflowItem {
  id: string;
  name: string;
  active: boolean;
  lastExecution?: string;
  status: 'success' | 'error' | 'running' | 'idle';
  executions: number;
}

const ModuleApp: React.FC = () => {
  const { t } = useTranslation('n8n');
  const n8nUrl = useN8nUrl();
  const {
    config, error, isAdmin,
    provisionStatus, isProvisioning, provisionError,
    startProvision, cancelSubscription,
  } = useTenantConfig();
  const [settingsOpen, setSettingsOpen] = useState(!config.has_config);
  const [integrations] = useState<IntegrationStatus[]>([
    {
      id: 'n8n',
      name: 'n8n Core',
      icon: <Workflow className="w-5 h-5" />,
      status: 'connected',
      lastSync: new Date().toISOString(),
      description: 'Workflow automation engine'
    },
    {
      id: 'sentinel',
      name: 'Sentinel/NDVI',
      icon: <Satellite className="w-5 h-5" />,
      status: 'connected',
      lastSync: new Date().toISOString(),
      description: 'Satellite imagery and vegetation indices'
    },
    {
      id: 'intelligence',
      name: 'Intelligence AI',
      icon: <Brain className="w-5 h-5" />,
      status: 'connected',
      lastSync: new Date().toISOString(),
      description: 'ML predictions and analysis'
    },
    {
      id: 'notifications',
      name: 'Notifications',
      icon: <Bell className="w-5 h-5" />,
      status: 'connected',
      lastSync: new Date().toISOString(),
      description: 'Multi-channel alerts (email, push, SMS)'
    },
    {
      id: 'odoo',
      name: 'Odoo ERP',
      icon: <Database className="w-5 h-5" />,
      status: 'pending',
      description: 'Farm management and inventory'
    },
    {
      id: 'ros2',
      name: 'ROS2 Robotics',
      icon: <Bot className="w-5 h-5" />,
      status: 'pending',
      description: 'Agricultural robot control'
    },
  ]);

  const [workflows, setWorkflows] = useState<WorkflowItem[]>([
    {
      id: '1',
      name: 'NDVI Alert Pipeline',
      active: true,
      lastExecution: new Date().toISOString(),
      status: 'success',
      executions: 156
    },
    {
      id: '2',
      name: 'Production Prediction',
      active: true,
      lastExecution: new Date().toISOString(),
      status: 'running',
      executions: 89
    },
    {
      id: '3',
      name: 'Pest Detection Alerts',
      active: true,
      lastExecution: new Date().toISOString(),
      status: 'success',
      executions: 234
    },
    {
      id: '4',
      name: 'Odoo Sync - Harvests',
      active: false,
      status: 'idle',
      executions: 0
    },
    {
      id: '5',
      name: 'Robot Mission Scheduler',
      active: false,
      status: 'idle',
      executions: 0
    },
  ]);

  const [loading, setLoading] = useState(false);

  const getStatusColor = (status: IntegrationStatus['status']) => {
    switch (status) {
      case 'connected': return 'text-green-500 bg-green-100';
      case 'disconnected': return 'text-gray-500 bg-gray-100';
      case 'error': return 'text-red-500 bg-red-100';
      case 'pending': return 'text-yellow-500 bg-yellow-100';
    }
  };

  const getStatusIcon = (status: IntegrationStatus['status']) => {
    switch (status) {
      case 'connected': return <CheckCircle2 className="w-4 h-4" />;
      case 'disconnected': return <AlertCircle className="w-4 h-4" />;
      case 'error': return <AlertCircle className="w-4 h-4" />;
      case 'pending': return <Clock className="w-4 h-4" />;
    }
  };

  const getWorkflowStatusColor = (status: WorkflowItem['status']) => {
    switch (status) {
      case 'success': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      case 'running': return 'bg-blue-500 animate-pulse';
      case 'idle': return 'bg-gray-400';
    }
  };

  const toggleWorkflow = (id: string) => {
    setWorkflows(prev => prev.map(w => 
      w.id === id ? { ...w, active: !w.active } : w
    ));
  };

  const refreshStatus = async () => {
    setLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setLoading(false);
  };

  return (
    <div className="w-full bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg n8n-gradient">
                <Workflow className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{t('app.title')}</h1>
                <p className="text-xs text-gray-500">{t('app.subtitle')}</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-orange-50 border border-orange-200 rounded-full ml-4">
                <Info className="w-4 h-4 text-orange-600" />
                <span className="text-xs text-orange-700">{t('app.standaloneMode')}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={refreshStatus}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                {t('app.refresh')}
              </button>
              {isAdmin ? (
                <button
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  {t('settings.expand')}
                </button>
              ) : n8nUrl || provisionStatus.n8n_url ? (
                <a
                  href={n8nUrl || provisionStatus.n8n_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  {t('app.openN8n')}
                </a>
              ) : (
                <span className="text-xs text-gray-400">{t('settings.notConfigured')}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* n8n Provisioning Panel (TenantAdmin only) */}
      {isAdmin && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className="bg-white rounded-lg shadow border border-orange-200">
            <div className="px-4 py-3 border-b border-orange-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-medium text-gray-700">
                  n8n Instance
                </span>
                <a
                  href="https://github.com/nkz-os/n8n-module-nkz/blob/main/docs/connect-n8n.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-400 hover:text-orange-500 ml-2"
                  title="Documentation"
                >
                  Docs ↗
                </a>
              </div>
              {provisionStatus.status === 'active' && (
                <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                  {t('settings.activeInstance')}
                </span>
              )}
              {provisionStatus.status === 'in_progress' && (
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                  ⏳
                </span>
              )}
            </div>

            <div className="px-4 py-4 space-y-3">
              {/* STATE: none */}
              {provisionStatus.status === 'none' && (
                <div>
                  <p className="text-sm text-gray-600 mb-3">
                    {provisionStatus.is_enterprise
                      ? t('settings.activateEnterprise')
                      : t('settings.activatePaid')}
                  </p>
                  <button
                    onClick={startProvision}
                    disabled={isProvisioning}
                    className="px-4 py-2 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded-lg disabled:opacity-50"
                  >
                    {isProvisioning ? '...' : t('settings.activateEnterprise').startsWith('Activate') ? 'Activate n8n' : 'Activar n8n'}
                  </button>
                </div>
              )}

              {/* STATE: in_progress */}
              {provisionStatus.status === 'in_progress' && (
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <RefreshCw className="w-4 h-4 animate-spin text-orange-500" />
                  {t('settings.provisioningInProgress')}
                </div>
              )}

              {/* STATE: active */}
              {provisionStatus.status === 'active' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">URL</label>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {provisionStatus.n8n_url}
                      </code>
                      <a
                        href={provisionStatus.n8n_url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-orange-500 hover:text-orange-600"
                      >
                        {t('settings.openInstance')} ↗
                      </a>
                    </div>
                  </div>
                  {provisionStatus.username && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        {t('settings.usernameLabel')}
                      </label>
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {provisionStatus.username}
                      </code>
                    </div>
                  )}
                  {provisionStatus.password && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Password
                      </label>
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {provisionStatus.password}
                      </code>
                    </div>
                  )}
                  <button
                    onClick={cancelSubscription}
                    className="px-4 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg"
                  >
                    {t('settings.cancelSubscription')}
                  </button>
                </div>
              )}

              {/* STATE: suspended */}
              {provisionStatus.status === 'suspended' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                    <AlertCircle className="w-4 h-4" />
                    <div>
                      <p className="text-sm font-medium">{t('settings.suspendedTitle')}</p>
                      <p className="text-xs">{t('settings.suspendedDesc')}</p>
                    </div>
                  </div>
                  <button
                    onClick={startProvision}
                    className="px-4 py-2 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded-lg"
                  >
                    {t('settings.manageSubscription')}
                  </button>
                </div>
              )}

              {/* STATE: grace_period */}
              {provisionStatus.status === 'grace_period' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-red-700 bg-red-50 px-3 py-2 rounded-lg">
                    <AlertCircle className="w-4 h-4" />
                    <div>
                      <p className="text-sm font-medium">{t('settings.gracePeriodTitle')}</p>
                      <p className="text-xs">
                        {t('settings.gracePeriodDesc', {
                          days: provisionStatus.days_remaining || 0,
                          date: new Date(Date.now() + (provisionStatus.days_remaining || 0) * 86400000).toLocaleDateString(),
                        })}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={startProvision}
                    className="px-4 py-2 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded-lg"
                  >
                    {t('settings.reactivateSubscription')}
                  </button>
                </div>
              )}

              {/* STATE: error */}
              {provisionStatus.status === 'error' && (
                <div className="flex items-center gap-2 text-red-700 bg-red-50 px-3 py-2 rounded-lg">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{provisionError || t('settings.errorProvisioning')}</span>
                  <button
                    onClick={startProvision}
                    className="ml-auto px-3 py-1 text-xs text-red-600 bg-red-100 hover:bg-red-200 rounded"
                  >
                    {t('settings.retry')}
                  </button>
                </div>
              )}

              {/* Existing config error (from legacy panel) */}
              {error && (
                <div className="text-xs px-3 py-2 rounded-lg bg-red-50 text-red-700">{error}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <Activity className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {integrations.filter(i => i.status === 'connected').length}
                </p>
                <p className="text-sm text-gray-500">{t('dashboard.activeIntegrations')}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Workflow className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {workflows.filter(w => w.active).length}
                </p>
                <p className="text-sm text-gray-500">{t('dashboard.activeWorkflows')}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <Play className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {workflows.reduce((acc, w) => acc + w.executions, 0)}
                </p>
                <p className="text-sm text-gray-500">{t('dashboard.totalExecutions')}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100">
                <CheckCircle2 className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {workflows.filter(w => w.status === 'success').length}
                </p>
                <p className="text-sm text-gray-500">{t('dashboard.successfulToday')}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Integrations Panel */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{t('dashboard.serviceIntegrationsTitle')}</h2>
              <p className="text-sm text-gray-500">{t('dashboard.serviceIntegrationsSubtitle')}</p>
            </div>
            <div className="p-6 space-y-3">
              {integrations.map(integration => (
                <div 
                  key={integration.id}
                  className={`integration-card ${
                    integration.status === 'connected' ? 'integration-card-active' : 
                    integration.status === 'error' ? 'integration-card-error' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${getStatusColor(integration.status)}`}>
                        {integration.icon}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{integration.name}</p>
                        <p className="text-xs text-gray-500">{integration.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${getStatusColor(integration.status)}`}>
                        {getStatusIcon(integration.status)}
                        {integration.status}
                      </span>
                    </div>
                  </div>
                  {integration.lastSync && (
                    <p className="text-xs text-gray-400 mt-2">
                      Last sync: {new Date(integration.lastSync).toLocaleString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Workflows Panel */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Active Workflows</h2>
              <p className="text-sm text-gray-500">Automated pipelines and triggers</p>
            </div>
            <div className="p-6 space-y-3">
              {workflows.map(workflow => (
                <div 
                  key={workflow.id}
                  className="p-4 rounded-lg border border-gray-200 bg-white hover:border-orange-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${getWorkflowStatusColor(workflow.status)}`} />
                      <div>
                        <p className="font-medium text-gray-900">{workflow.name}</p>
                        <p className="text-xs text-gray-500">
                          {workflow.executions} executions
                          {workflow.lastExecution && ` · Last: ${new Date(workflow.lastExecution).toLocaleString()}`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleWorkflow(workflow.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        workflow.active 
                          ? 'bg-green-100 text-green-600 hover:bg-green-200' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {workflow.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Info Banner */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> This standalone view is for development and monitoring. 
                In production, the module integrates into the Unified Viewer via slots for 
                real-time workflow status and execution monitoring.
              </p>
              {n8nUrl || provisionStatus.n8n_url ? (
                <p className="text-xs text-blue-600 mt-2">
                  Access the full n8n interface at{' '}
                  <a href={n8nUrl || provisionStatus.n8n_url || '#'} className="underline" target="_blank" rel="noopener">
                    {(n8nUrl || provisionStatus.n8n_url || '').replace('https://', '')}
                  </a>
                </p>
              ) : (
                <p className="text-xs text-blue-600 mt-2">
                  {t('settings.notConfigured')}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// CRITICAL: Export as default - required for Module Federation
export default ModuleApp;
