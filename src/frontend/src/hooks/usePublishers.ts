import { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import { Publisher, publisherService } from '../services/publisherService';

interface UsePublishersResult {
  publishers: Publisher[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const usePublishers = (environmentId?: string): UsePublishersResult => {
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { accounts, inProgress } = useMsal();

  const fetchPublishers = async () => {
    // Don't fetch if no environment is selected
    if (!environmentId) {
      setPublishers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const data = await publisherService.getPublishers(environmentId);
      setPublishers(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch publishers';
      setError(errorMessage);
      console.error('Error fetching publishers:', err);
      
      // Fallback to empty array or default publishers if needed
      setPublishers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch publishers when environment is selected
    // Note: With Easy Auth v2, accounts might be empty (auth handled by App Service)
    // so we check if auth is not in progress OR if we have accounts
    const isAuthReady = inProgress === 'none' || accounts.length > 0;
    
    if (isAuthReady && environmentId) {
      console.log('🔄 usePublishers: Fetching publishers for environment:', environmentId);
      fetchPublishers();
    } else if (!environmentId) {
      // Clear publishers if no environment is selected
      console.log('⏸️ usePublishers: No environment selected, clearing publishers');
      setPublishers([]);
      setError(null);
    } else {
      console.log('⏸️ usePublishers: Waiting for auth:', {
        isAuthReady,
        accountsLength: accounts.length,
        inProgress
      });
    }
  }, [accounts.length, inProgress, environmentId]);

  return {
    publishers,
    loading,
    error,
    refetch: fetchPublishers,
  };
};
