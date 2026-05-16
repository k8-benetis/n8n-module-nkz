import { defineModule } from '@nekazari/module-kit';
import { lazy } from 'react';
import './i18n';
import { moduleSlots } from './slots';
import pkg from '../package.json';

const MainPage = lazy(() => import('./App'));

export default defineModule({
  id: 'n8n-nkz',
  displayName: 'n8n Integration Hub',
  version: pkg.version,
  hostApiVersion: '^2.0.0',
  description: 'Workflow orchestration and integration hub powered by n8n — Nekazari Platform Module',
  accent: { base: '#FF6D00', soft: '#FFE0B2', strong: '#E65100' },
  icon: 'workflow',
  main: MainPage,
  api: { basePath: '/api/n8n' },
  requiredPlan: 'premium',
  slots: moduleSlots as never,
});
