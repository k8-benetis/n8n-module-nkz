// @ts-ignore
import { i18n } from '@nekazari/sdk';
import en from './locales/en.json';
import es from './locales/es.json';

const N8N_NAMESPACE = 'n8n';

export function registerN8nTranslations(): void {
  if (!i18n || typeof (i18n as any).addResourceBundle !== 'function') return;

  // Deep-merge so repeated imports are safe, and host resources remain intact.
  i18n.addResourceBundle('en', N8N_NAMESPACE, en, true, true);
  i18n.addResourceBundle('es', N8N_NAMESPACE, es, true, true);
}

registerN8nTranslations();

