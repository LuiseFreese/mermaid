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
    // Fetch global choices when environment is selected
    // Note: With Easy Auth v2, accounts might be empty (auth handled by App Service)
    // so we check if auth is not in progress OR if we have accounts
    const isAuthReady = inProgress === 'none' || accounts.length > 0;
    
    if (isAuthReady && wizardData.targetEnvironment?.id) {
      console.log('🔄 useGlobalChoices: Fetching global choices for environment:', wizardData.targetEnvironment.id);
      fetchGlobalChoices();
    } else {
      console.log('⏸️ useGlobalChoices: Waiting for auth/environment:', {
        isAuthReady,
        hasEnvironment: Boolean(wizardData.targetEnvironment?.id),
        accountsLength: accounts.length,
        inProgress
      });
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
