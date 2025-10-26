import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface DeploymentContextState {
  isDeploymentActive: boolean;
  isRollbackActive: boolean;
  deploymentId: string | null;
  rollbackId: string | null;
  blockNavigation: boolean;
}

interface DeploymentContextValue extends DeploymentContextState {
  startDeployment: (deploymentId: string) => void;
  finishDeployment: () => void;
  startRollback: (rollbackId: string) => void;
  finishRollback: () => void;
  setNavigationBlocked: (blocked: boolean) => void;
}

const DeploymentContext = createContext<DeploymentContextValue | undefined>(undefined);

interface DeploymentProviderProps {
  children: ReactNode;
}

export const DeploymentProvider: React.FC<DeploymentProviderProps> = ({ children }) => {
  const [deploymentState, setDeploymentState] = useState<DeploymentContextState>({
    isDeploymentActive: false,
    isRollbackActive: false,
    deploymentId: null,
    rollbackId: null,
    blockNavigation: false
  });

  const startDeployment = useCallback((deploymentId: string) => {
    setDeploymentState(prev => ({
      ...prev,
      isDeploymentActive: true,
      deploymentId,
      blockNavigation: true
    }));
  }, []);

  const finishDeployment = useCallback(() => {
    setDeploymentState(prev => ({
      ...prev,
      isDeploymentActive: false,
      deploymentId: null,
      blockNavigation: false
    }));
  }, []);

  const startRollback = useCallback((rollbackId: string) => {
    setDeploymentState(prev => ({
      ...prev,
      isRollbackActive: true,
      rollbackId,
      blockNavigation: true
    }));
  }, []);

  const finishRollback = useCallback(() => {
    setDeploymentState(prev => ({
      ...prev,
      isRollbackActive: false,
      rollbackId: null,
      blockNavigation: false
    }));
  }, []);

  const setNavigationBlocked = useCallback((blocked: boolean) => {
    setDeploymentState(prev => ({
      ...prev,
      blockNavigation: blocked
    }));
  }, []);

  const value: DeploymentContextValue = {
    ...deploymentState,
    startDeployment,
    finishDeployment,
    startRollback,
    finishRollback,
    setNavigationBlocked
  };

  return (
    <DeploymentContext.Provider value={value}>
      {children}
    </DeploymentContext.Provider>
  );
};

export const useDeploymentContext = (): DeploymentContextValue => {
  const context = useContext(DeploymentContext);
  if (context === undefined) {
    throw new Error('useDeploymentContext must be used within a DeploymentProvider');
  }
  return context;
};