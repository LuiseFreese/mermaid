import { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import { GlobalChoice, globalChoicesService } from '../services/globalChoicesService';

interface UseGlobalChoicesResult {
  globalChoices: GlobalChoice[];
  builtInChoices: GlobalChoice[];
  customChoices: GlobalChoice[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useGlobalChoices = (): UseGlobalChoicesResult => {
  const [globalChoices, setGlobalChoices] = useState<GlobalChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { accounts, inProgress } = useMsal();

  const fetchGlobalChoices = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await globalChoicesService.getGlobalChoices();
      setGlobalChoices(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch global choices';
      setError(errorMessage);
      console.error('Error fetching global choices:', err);
      
      // Fallback to empty array
      setGlobalChoices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch global choices after authentication completes
    if (accounts.length > 0 && inProgress === 'none') {
      fetchGlobalChoices();
    }
  }, [accounts.length, inProgress]);

  // Separate built-in and custom choices
  const builtInChoices = globalChoices.filter(choice => !choice.isCustom);
  const customChoices = globalChoices.filter(choice => choice.isCustom);

  return {
    globalChoices,
    builtInChoices,
    customChoices,
    loading,
    error,
    refetch: fetchGlobalChoices,
  };
};
