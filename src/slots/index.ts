/**
 * Slot Registration for n8n Integration Hub
 * Defines all slots that integrate with the Unified Viewer.
 * 
 * All widgets include explicit moduleId for proper host integration.
 */

import React from 'react';
// Import slot components
import { WorkflowStatusPanel } from '../components/slots/WorkflowStatusPanel';
import { ExecutionMonitor } from '../components/slots/ExecutionMonitor';
import { IntegrationStatus } from '../components/slots/IntegrationStatus';

// Module identifier - used for all slot widgets
const MODULE_ID = 'n8n-nkz';

// Type definitions for slot widgets (matching SDK types)
export interface SlotWidgetDefinition {
  id: string;
  /** Module ID that owns this widget. REQUIRED for remote modules. */
  moduleId: string;
  component: string;
  priority: number;
  localComponent: React.ComponentType<any>;
  defaultProps?: Record<string, any>;
  showWhen?: {
    entityType?: string[];
    layerActive?: string[];
  };
}

export type SlotType = 'layer-toggle' | 'context-panel' | 'bottom-panel' | 'entity-tree';

export interface ModuleViewerSlots {
  'layer-toggle'?: SlotWidgetDefinition[];
  'context-panel'?: SlotWidgetDefinition[];
  'bottom-panel'?: SlotWidgetDefinition[];
  'entity-tree'?: SlotWidgetDefinition[];
  moduleProvider?: React.ComponentType<{ children: React.ReactNode }>;
}

/**
 * n8n Integration Hub Slots Configuration
 * All widgets explicitly declare moduleId for proper provider wrapping.
 * 
 * Available slots:
 * - 'layer-toggle': Layer manager controls
 * - 'context-panel': Right panel (entity details)
 * - 'bottom-panel': Bottom panel (timeline, charts)
 * - 'entity-tree': Left panel (entity tree)
 */
export const moduleSlots: ModuleViewerSlots = {
  'layer-toggle': [
    // Integration status toggle for quick overview
    {
      id: 'n8n-nkz-integration-toggle',
      moduleId: MODULE_ID,
      component: 'IntegrationStatus',
      priority: 80,
      localComponent: IntegrationStatus,
    }
  ],
  'context-panel': [
    // Workflow status panel - shows when entity is selected
    {
      id: 'n8n-nkz-workflow-status',
      moduleId: MODULE_ID,
      component: 'WorkflowStatusPanel',
      priority: 60,
      localComponent: WorkflowStatusPanel,
      showWhen: {
        entityType: ['AgriParcel', 'Building', 'Device', 'Robot']
      }
    }
  ],
  'bottom-panel': [
    // Execution monitor - timeline of workflow executions
    {
      id: 'n8n-nkz-execution-monitor',
      moduleId: MODULE_ID,
      component: 'ExecutionMonitor',
      priority: 70,
      localComponent: ExecutionMonitor,
    }
  ],
  'entity-tree': []
};

/**
 * Export as viewerSlots for host integration
 * The host will look for this export to register slots
 */
export const viewerSlots = moduleSlots;
