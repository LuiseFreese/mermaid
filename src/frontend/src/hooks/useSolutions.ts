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
    // Fetch solutions when environment is selected
    // Note: With Easy Auth v2, accounts might be empty (auth handled by App Service)
    // so we check if auth is not in progress OR if we have accounts
    const isAuthReady = inProgress === 'none' || accounts.length > 0;
    
    if (isAuthReady && environmentId) {
      console.log('🔄 useSolutions: Fetching solutions for environment:', environmentId);
      fetchSolutions();
    } else if (!environmentId) {
      // Clear solutions if no environment is selected
      console.log('⏸️ useSolutions: No environment selected, clearing solutions');
      setSolutions([]);
      setError(null);
    } else {
      console.log('⏸️ useSolutions: Waiting for auth:', {
        isAuthReady,
        accountsLength: accounts.length,
        inProgress
      });
    }
  }, [accounts.length, inProgress, environmentId]);

  return {
    solutions,
    loading,
    error,
    refetch: fetchSolutions,
  };
};
