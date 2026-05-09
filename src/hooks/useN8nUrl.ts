import { useEffect, useState } from 'react';
import { useAuth } from '@nekazari/sdk';
import { useModuleApi } from '@/services/api';

let cachedUrl: string | null = null;

export function useN8nUrl(): string | null {
  const { isAuthenticated } = useAuth();
  const api = useModuleApi();
  const [url, setUrl] = useState<string | null>(cachedUrl);

  useEffect(() => {
    if (cachedUrl) return;
    if (!isAuthenticated) return;

    api.getN8nUrl().then((fetchedUrl: string) => {
      cachedUrl = fetchedUrl;
      setUrl(fetchedUrl);
    }).catch(() => {
      // Silent fallback — button simply won't render if URL unavailable
    });
  }, [isAuthenticated]);

  return url;
}
