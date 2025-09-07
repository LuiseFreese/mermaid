import { useState, useEffect } from 'react';
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
    fetchSolutions();
  }, []);

  return {
    solutions,
    loading,
    error,
    refetch: fetchSolutions,
  };
};
