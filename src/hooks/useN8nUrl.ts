import { useEffect, useState } from 'react';
import { useAuth } from '@nekazari/sdk';
import { useModuleApi } from '@/services/api';

let cachedUrl: string | null = null;

function deriveFallbackUrl(): string {
  return `https://n8n.${window.location.hostname}`;
}

export function useN8nUrl(): string {
  const { isAuthenticated } = useAuth();
  const api = useModuleApi();
  const [url, setUrl] = useState<string>(cachedUrl || deriveFallbackUrl());

  useEffect(() => {
    if (cachedUrl) return;
    if (!isAuthenticated) return;

    api.getN8nUrl().then((fetchedUrl: string) => {
      cachedUrl = fetchedUrl;
      setUrl(fetchedUrl);
    }).catch(() => {
      cachedUrl = deriveFallbackUrl();
      setUrl(cachedUrl);
    });
  }, [isAuthenticated]);

  return url;
}
