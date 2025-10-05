import { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import { Solution, solutionService } from '../services/solutionService';

interface UseSolutionsResult {
  solutions: Solution[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useSolutions = (): UseSolutionsResult => {
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { accounts, inProgress } = useMsal();

  const fetchSolutions = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await solutionService.getSolutions();
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
    // Only fetch solutions after authentication completes
    if (accounts.length > 0 && inProgress === 'none') {
      fetchSolutions();
    }
  }, [accounts.length, inProgress]);

  return {
    solutions,
    loading,
    error,
    refetch: fetchSolutions,
  };
};
