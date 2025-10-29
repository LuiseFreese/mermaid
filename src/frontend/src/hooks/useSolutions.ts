import { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import { Solution, solutionService } from '../services/solutionService';

interface UseSolutionsResult {
  solutions: Solution[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useSolutions = (environmentId?: string): UseSolutionsResult => {
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { accounts, inProgress } = useMsal();

  const fetchSolutions = async () => {
    // Don't fetch if no environment is selected
    if (!environmentId) {
      setSolutions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const data = await solutionService.getSolutions(environmentId);
      setSolutions(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch solutions';
      setError(errorMessage);
      console.error('Error fetching solutions:', err);
      
      // Fallback to empty array if fetch fails
      setSolutions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch solutions after authentication completes and environment is selected
    if (accounts.length > 0 && inProgress === 'none' && environmentId) {
      fetchSolutions();
    } else if (!environmentId) {
      // Clear solutions if no environment is selected
      setSolutions([]);
      setError(null);
    }
  }, [accounts.length, inProgress, environmentId]);

  return {
    solutions,
    loading,
    error,
    refetch: fetchSolutions,
  };
};
