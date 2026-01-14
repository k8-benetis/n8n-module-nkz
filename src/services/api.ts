/**
 * API Client for n8n Integration Hub
 * 
 * Provides access to all integration endpoints:
 * - n8n workflows and executions
 * - Sentinel/NDVI analysis
 * - Intelligence AI predictions
 * - Notifications
 * - Odoo ERP sync
 * - ROS2 robotics
 */

import { NKZClient, useAuth } from '@nekazari/sdk';
import type {
  N8nWorkflow,
  N8nExecution,
  N8nWebhook,
  SentinelAnalysisRequest,
  SentinelAnalysisResult,
  NDVIAlert,
  PredictionRequest,
  PredictionResult,
  NotificationRequest,
  NotificationResult,
  OdooSyncStatus,
  ROS2Robot,
  ROS2Mission,
  ROS2Command,
  IntegrationHealth,
  WebhookConfig,
} from '@/types/integrations';

const API_BASE = '/api/n8n-nkz';

/**
 * Hook to get API client instance
 * Automatically handles authentication and tenant context
 */
export function useModuleApi() {
  const { getToken, tenantId } = useAuth();
  
  const client = new NKZClient({
    baseUrl: API_BASE,
    getToken,
    getTenantId: () => tenantId,
  });

  return {
    // =========================================================================
    // Health & Status
    // =========================================================================
    
    /** Get health status of all integrations */
    getIntegrationsHealth: (): Promise<IntegrationHealth[]> => 
      client.get('/health/integrations'),
    
    /** Get specific integration health */
    getIntegrationHealth: (id: string): Promise<IntegrationHealth> =>
      client.get(`/health/integrations/${id}`),

    // =========================================================================
    // n8n Workflows
    // =========================================================================
    
    /** List all n8n workflows */
    getWorkflows: (): Promise<{ workflows: N8nWorkflow[] }> => 
      client.get('/n8n/workflows'),
    
    /** Get workflow by ID */
    getWorkflow: (id: string): Promise<N8nWorkflow> => 
      client.get(`/n8n/workflows/${id}`),
    
    /** Activate/deactivate workflow */
    toggleWorkflow: (id: string, active: boolean): Promise<N8nWorkflow> =>
      client.put(`/n8n/workflows/${id}/active`, { active }),
    
    /** Execute workflow manually */
    executeWorkflow: (id: string, data?: any): Promise<N8nExecution> =>
      client.post(`/n8n/workflows/${id}/execute`, data),

    // =========================================================================
    // n8n Executions
    // =========================================================================
    
    /** List executions with optional filters */
    getExecutions: (params?: {
      workflowId?: string;
      status?: string;
      limit?: number;
    }): Promise<{ executions: N8nExecution[] }> =>
      client.get('/n8n/executions', { params }),
    
    /** Get execution details */
    getExecution: (id: string): Promise<N8nExecution> =>
      client.get(`/n8n/executions/${id}`),

    // =========================================================================
    // n8n Webhooks
    // =========================================================================
    
    /** List registered webhooks */
    getWebhooks: (): Promise<{ webhooks: N8nWebhook[] }> =>
      client.get('/n8n/webhooks'),

    // =========================================================================
    // Sentinel/NDVI Analysis
    // =========================================================================
    
    /** Request satellite analysis for parcels */
    requestAnalysis: (request: SentinelAnalysisRequest): Promise<{ jobId: string }> =>
      client.post('/sentinel/analyze', request),
    
    /** Get analysis results */
    getAnalysisResults: (parcelId: string, params?: {
      startDate?: string;
      endDate?: string;
      index?: string;
    }): Promise<{ results: SentinelAnalysisResult[] }> =>
      client.get(`/sentinel/parcels/${parcelId}/results`, { params }),
    
    /** Get active NDVI alerts */
    getNDVIAlerts: (params?: {
      parcelId?: string;
      severity?: string;
    }): Promise<{ alerts: NDVIAlert[] }> =>
      client.get('/sentinel/alerts', { params }),
    
    /** Configure NDVI alert thresholds */
    setAlertThresholds: (parcelId: string, thresholds: {
      lowNdvi?: number;
      rapidDecline?: number;
    }): Promise<void> =>
      client.put(`/sentinel/parcels/${parcelId}/thresholds`, thresholds),

    // =========================================================================
    // Intelligence AI Predictions
    // =========================================================================
    
    /** Request AI prediction */
    requestPrediction: (request: PredictionRequest): Promise<{ jobId: string }> =>
      client.post('/intelligence/predict', request),
    
    /** Get prediction result */
    getPrediction: (jobId: string): Promise<PredictionResult> =>
      client.get(`/intelligence/predictions/${jobId}`),
    
    /** List predictions for entity */
    getEntityPredictions: (entityId: string, params?: {
      type?: string;
      limit?: number;
    }): Promise<{ predictions: PredictionResult[] }> =>
      client.get(`/intelligence/entities/${entityId}/predictions`, { params }),
    
    /** Trigger intelligence analysis via webhook */
    triggerIntelligenceWebhook: (data: any): Promise<{ jobId: string }> =>
      client.post('/intelligence/webhook', data),

    // =========================================================================
    // Notifications
    // =========================================================================
    
    /** Send notification */
    sendNotification: (request: NotificationRequest): Promise<NotificationResult[]> =>
      client.post('/notifications/send', request),
    
    /** Get notification templates */
    getNotificationTemplates: (): Promise<{ templates: any[] }> =>
      client.get('/notifications/templates'),
    
    /** Test notification channel */
    testNotificationChannel: (channel: string, recipient: string): Promise<NotificationResult> =>
      client.post('/notifications/test', { channel, recipient }),

    // =========================================================================
    // Odoo ERP Integration
    // =========================================================================
    
    /** Get Odoo sync status */
    getOdooSyncStatus: (): Promise<OdooSyncStatus> =>
      client.get('/odoo/status'),
    
    /** Trigger manual Odoo sync */
    triggerOdooSync: (entities?: string[]): Promise<{ jobId: string }> =>
      client.post('/odoo/sync', { entities }),
    
    /** Get synced parcels from Odoo */
    getOdooParcels: (): Promise<{ parcels: any[] }> =>
      client.get('/odoo/parcels'),
    
    /** Get harvest records from Odoo */
    getOdooHarvests: (params?: {
      parcelId?: number;
      startDate?: string;
      endDate?: string;
    }): Promise<{ harvests: any[] }> =>
      client.get('/odoo/harvests', { params }),
    
    /** Push data to Odoo */
    pushToOdoo: (model: string, data: any): Promise<{ odooId: number }> =>
      client.post(`/odoo/push/${model}`, data),

    // =========================================================================
    // ROS2 Robotics
    // =========================================================================
    
    /** List connected robots */
    getRobots: (): Promise<{ robots: ROS2Robot[] }> =>
      client.get('/ros2/robots'),
    
    /** Get robot details */
    getRobot: (id: string): Promise<ROS2Robot> =>
      client.get(`/ros2/robots/${id}`),
    
    /** Send command to robot */
    sendRobotCommand: (command: ROS2Command): Promise<{ accepted: boolean }> =>
      client.post('/ros2/commands', command),
    
    /** List missions */
    getMissions: (params?: {
      robotId?: string;
      status?: string;
    }): Promise<{ missions: ROS2Mission[] }> =>
      client.get('/ros2/missions', { params }),
    
    /** Create new mission */
    createMission: (mission: Omit<ROS2Mission, 'id' | 'status' | 'progress'>): Promise<ROS2Mission> =>
      client.post('/ros2/missions', mission),
    
    /** Get robot telemetry stream endpoint */
    getRobotTelemetryUrl: (robotId: string): string =>
      `${API_BASE}/ros2/robots/${robotId}/telemetry/stream`,

    // =========================================================================
    // Webhook Configuration
    // =========================================================================
    
    /** List webhook configurations */
    getWebhookConfigs: (): Promise<{ webhooks: WebhookConfig[] }> =>
      client.get('/webhooks'),
    
    /** Create webhook configuration */
    createWebhookConfig: (config: Omit<WebhookConfig, 'id' | 'lastTriggered' | 'failureCount'>): Promise<WebhookConfig> =>
      client.post('/webhooks', config),
    
    /** Update webhook configuration */
    updateWebhookConfig: (id: string, config: Partial<WebhookConfig>): Promise<WebhookConfig> =>
      client.put(`/webhooks/${id}`, config),
    
    /** Delete webhook configuration */
    deleteWebhookConfig: (id: string): Promise<void> =>
      client.delete(`/webhooks/${id}`),
    
    /** Test webhook */
    testWebhook: (id: string): Promise<{ success: boolean; response?: any; error?: string }> =>
      client.post(`/webhooks/${id}/test`),
  };
}

/**
 * Standalone API client (for use outside React components)
 */
export function createModuleApiClient(token: string, tenantId: string) {
  const client = new NKZClient({
    baseUrl: API_BASE,
    getToken: () => token,
    getTenantId: () => tenantId,
  });

  // Return same methods as hook but using static token/tenant
  return {
    getIntegrationsHealth: (): Promise<IntegrationHealth[]> => 
      client.get('/health/integrations'),
    getWorkflows: (): Promise<{ workflows: N8nWorkflow[] }> => 
      client.get('/n8n/workflows'),
    // ... add other methods as needed
  };
}
