import React, { createContext, useContext, useState, ReactNode } from 'react';

// Define types for wizard data
export interface Publisher {
  id: string;
  displayName: string;
  uniqueName: string;
  prefix: string;
}

export interface Solution {
  solutionid: string;
  uniquename: string;
  friendlyname: string;
  _publisherid_value?: string;
  publisherid?: {
    publisherid: string;
    uniquename: string;
    customizationprefix: string;
  };
}

export interface GlobalChoice {
  id: string;
  displayName: string;
  name: string;
  logicalName?: string;
  isCustom?: boolean;
  options?: { value: number; label: string; }[];
}

export interface EntityAttribute {
  name: string;
  type: string;
  constraint?: string;
}

export interface Entity {
  name: string;
  attributes?: (string | EntityAttribute)[];
  isCdm?: boolean;
}

export interface Relationship {
  from: string;
  to: string;
  type: string;
  label: string;
  cardinality?: string;
}

export interface WizardData {
  // File Upload Step
  uploadedFile: File | null;
  originalErdContent: string;
  correctedErdContent: string;
  parsedEntities: Entity[];
  parsedRelationships: Relationship[];
  cdmDetected: boolean;
  detectedEntities: string[];
  entityChoice: 'cdm' | 'custom' | null;
  fixedIssues: Set<string>;
  
  // Solution Setup Step
  solutionType: 'new' | 'existing';
  solutionName: string;
  solutionInternalName: string;
  selectedSolution: Solution | null;
  publisherType: 'existing' | 'new';
  selectedPublisher: Publisher | null;
  newPublisherName: string;
  newPublisherInternalName: string;
  newPublisherPrefix: string;
  includeRelatedTables: boolean;
  
  // Global Choices Step
  globalChoicesSearchTerm: string;
  selectedGlobalChoices: GlobalChoice[];
  uploadedGlobalChoices: GlobalChoice[];
}

// Initial state
const initialWizardData: WizardData = {
  // File Upload Step
  uploadedFile: null,
  originalErdContent: '',
  correctedErdContent: '',
  parsedEntities: [],
  parsedRelationships: [],
  cdmDetected: false,
  detectedEntities: [],
  entityChoice: null,
  fixedIssues: new Set(),
  
  // Solution Setup Step
  solutionType: 'new',
  solutionName: '',
  solutionInternalName: '',
  selectedSolution: null,
  publisherType: 'existing',
  selectedPublisher: null,
  newPublisherName: '',
  newPublisherInternalName: '',
  newPublisherPrefix: '',
  includeRelatedTables: false,
  
  // Global Choices Step
  globalChoicesSearchTerm: '',
  selectedGlobalChoices: [],
  uploadedGlobalChoices: []
};

// Context type
interface WizardContextType {
  wizardData: WizardData;
  updateWizardData: (updates: Partial<WizardData>) => void;
  resetWizard: () => void;
}

// Create context
const WizardContext = createContext<WizardContextType | undefined>(undefined);

// Provider component
interface WizardProviderProps {
  children: ReactNode;
}

export const WizardProvider: React.FC<WizardProviderProps> = ({ children }) => {
  const [wizardData, setWizardData] = useState<WizardData>(initialWizardData);

  const updateWizardData = (updates: Partial<WizardData>) => {
    setWizardData(prev => ({ ...prev, ...updates }));
  };

  const resetWizard = () => {
    setWizardData(initialWizardData);
  };

  return (
    <WizardContext.Provider value={{
      wizardData,
      updateWizardData,
      resetWizard,
    }}>
      {children}
    </WizardContext.Provider>
  );
};

// Custom hook to use wizard context
export const useWizardContext = () => {
  const context = useContext(WizardContext);
  if (context === undefined) {
    throw new Error('useWizardContext must be used within a WizardProvider');
  }
  return context;
};
