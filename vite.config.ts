import { defineConfig } from 'vite';
import { nkzModulePreset } from '@nekazari/module-builder';

export default defineConfig(
  nkzModulePreset({
    moduleId: 'n8n-nkz',
    entry: 'src/moduleEntry.ts',
  }),
);
