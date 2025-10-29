import { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import { GlobalChoice, globalChoicesService } from '../services/globalChoicesService';
import { useWizardContext } from '../context/WizardContext';

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
  const { wizardData } = useWizardContext();

  const fetchGlobalChoices = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get environmentId from wizard context (selected in Solution Setup step)
      const environmentId = wizardData.targetEnvironment?.id;
      
      if (!environmentId) {
        console.warn('⚠️ No environment selected - skipping global choices fetch');
        setGlobalChoices([]);
        setLoading(false);
        return;
      }
      
      console.log('🌍 Fetching global choices for environment:', environmentId);
      const data = await globalChoicesService.getGlobalChoices(environmentId);
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
    // Only fetch global choices after authentication completes AND environment is selected
    if (accounts.length > 0 && inProgress === 'none' && wizardData.targetEnvironment?.id) {
      fetchGlobalChoices();
    }
  }, [accounts.length, inProgress, wizardData.targetEnvironment?.id]);

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
