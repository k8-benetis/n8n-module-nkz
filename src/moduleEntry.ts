import './i18n';
import App from './App';
import { WorkflowStatusPanel } from './components/slots/WorkflowStatusPanel';
import { ExecutionMonitor } from './components/slots/ExecutionMonitor';
import { IntegrationStatus } from './components/slots/IntegrationStatus';
import { WebhookConfigPanel } from './components/slots/WebhookConfigPanel';
import { NotificationsPanel } from './components/slots/NotificationsPanel';

const NKZ = (window as any).__NKZ__;

console.log('[nkz-module-n8n] Bundle loaded v1.0.0');
console.log('[nkz-module-n8n] __NKZ__:', typeof NKZ);

NKZ.register({
  id: 'n8n-nkz',
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

console.log('[nkz-module-n8n] Registered — id=n8n-nkz, version=1.0.0, main page + 5 viewer slots');
