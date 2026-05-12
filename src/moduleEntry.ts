import { defineModule } from '@nekazari/module-kit';
import './i18n';
import App from './App';
import { WorkflowStatusPanel } from './components/slots/WorkflowStatusPanel';
import { ExecutionMonitor } from './components/slots/ExecutionMonitor';
import { IntegrationStatus } from './components/slots/IntegrationStatus';
import { WebhookConfigPanel } from './components/slots/WebhookConfigPanel';
import { NotificationsPanel } from './components/slots/NotificationsPanel';

const MODULE_ID = 'n8n-nkz';

const moduleConfig = defineModule({
  id: MODULE_ID,
  displayName: 'n8n Integration Hub',
  accent: { base: '#FF6D00', soft: '#FFE0B2', strong: '#E65100' },
  hostApiVersion: '^2.0.0',
  api: { basePath: '/api/n8n' },
});

const NKZ = (window as any).__NKZ__;

NKZ.register({
  id: MODULE_ID,
  version: '1.0.0',
  main: App,
  viewerSlots: [
    {
      slot: 'layer-toggle',
      component: IntegrationStatus,
    },
    {
      slot: 'context-panel',
      component: WorkflowStatusPanel,
      tab: 'Workflows',
    },
    {
      slot: 'context-panel',
      component: WebhookConfigPanel,
      tab: 'Webhooks',
    },
    {
      slot: 'context-panel',
      component: NotificationsPanel,
      tab: 'Notificaciones',
    },
    {
      slot: 'bottom-panel',
      component: ExecutionMonitor,
    },
  ],
});

export default moduleConfig;
