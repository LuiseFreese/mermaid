import { useState, useEffect } from 'react';
import { Publisher, publisherService } from '../services/publisherService';

interface UsePublishersResult {
  publishers: Publisher[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const usePublishers = (): UsePublishersResult => {
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPublishers = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await publisherService.getPublishers();
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
    fetchPublishers();
  }, []);

  return {
    publishers,
    loading,
    error,
    refetch: fetchPublishers,
  };
};
