import { useEffect, useState } from 'react';
import { useAuth } from '@nekazari/sdk';
import { useModuleApi } from '@/services/api';

let cachedUrl: string | null | undefined = undefined;

export function useN8nUrl(): string | null {
  const { isAuthenticated } = useAuth();
  const api = useModuleApi();
  const [url, setUrl] = useState<string | null>(
    cachedUrl !== undefined ? cachedUrl : null
  );

  useEffect(() => {
    if (cachedUrl !== undefined) return;
    if (!isAuthenticated) return;

    api.getN8nUrl().then((fetchedUrl: string | null) => {
      cachedUrl = fetchedUrl;
      setUrl(fetchedUrl);
    }).catch(() => {
      cachedUrl = null;
      setUrl(null);
    });
  }, [isAuthenticated]);

  return url;
}
