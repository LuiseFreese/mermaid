/**
 * Solution Setup Step
 * Integrates solution and publisher configuration with extracted components
 *
 * This is the new modular version that replaces the monolithic original.
 * It maintains the same external interface while using our extracted:
 * - UI Components (SearchableDropdown, SolutionConfigSection, PublisherConfigSection)
 * - Business Logic Hooks (useSolutionConfiguration, usePublisherConfiguration)
 * - Utilities and Types (validation, filtering, name generation)
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Text,
  Button,
  MessageBar,
  MessageBarBody,
  Card,
  Divider,
  Spinner,
} from '@fluentui/react-components';
import { 
  InfoRegular, 
  CheckmarkCircleRegular,
  WarningRegular,
  ErrorCircleRegular,
} from '@fluentui/react-icons';

// Import our modular components
import { 
  SolutionConfigSection, 
  PublisherConfigSection 
} from './components';

// Import configuration hooks
import { 
  useSolutionConfiguration, 
  usePublisherConfiguration,
  useFormValidation 
} from './hooks';

// Import types
import { 
  SolutionSetupStepProps,
  SolutionFormData,
  PublisherFormData,
} from './types';

// Import wizard context
import { useWizardContext } from '../../../../context/WizardContext';

// Import utilities
import styles from './SolutionSetupStep.module.css';

export const SolutionSetupStep: React.FC<SolutionSetupStepProps> = ({
  // Data sources (currently unused - hooks provide their own data)
  solutions: _solutions = [],
  publishers: _publishers = [],
  
  // Current state
  currentSolution,
  currentPublisher,
  formData: externalFormData,
  
  // State management (currently unused - using local handlers)
  onSolutionChange: _onSolutionChange,
  onPublisherChange: _onPublisherChange,
  onFormDataChange,
  onValidationChange,
  
  // UI state
  loading = false,
  error = null,
  
  // Event handlers
  onCreateSolution,
  onCreatePublisher,
  onEditSolution,
  onEditPublisher,
  onRefreshData,
  
  // Validation
  validationErrors = {},
  
  // UI configuration
  disabled = false,
  showValidation = true,
  autoValidate = true,
}) => {
  // Local form state
  const [solutionFormData, setSolutionFormData] = useState<SolutionFormData>({
    name: externalFormData?.solutionName || '',
    internalName: externalFormData?.solutionInternalName || '',
    includeRelatedTables: externalFormData?.includeRelatedTables || false,
    solutionName: externalFormData?.solutionName || '',
    solutionUniqueName: externalFormData?.solutionInternalName || '',
  });

  const [publisherFormData, setPublisherFormData] = useState<PublisherFormData>({
    name: externalFormData?.newPublisherName || '',
    internalName: externalFormData?.newPublisherInternalName || '',
    prefix: externalFormData?.newPublisherPrefix || '',
    publisherName: externalFormData?.newPublisherName || '',
    publisherUniqueName: externalFormData?.newPublisherInternalName || '',
    publisherPrefix: externalFormData?.newPublisherPrefix || '',
    publisherDescription: '',
  });

  // Environment state (loaded but not displayed in this component)
  const [_environments, setEnvironments] = useState<any[]>([]);
  const [selectedEnvironment, setSelectedEnvironment] = useState<{ id: string; name: string; url: string; powerPlatformEnvironmentId?: string; color?: string; } | null>(null);
  const [_environmentsLoading, setEnvironmentsLoading] = useState(false);
  const [_environmentsError, setEnvironmentsError] = useState<string | null>(null);

  // Wizard context
  const { updateWizardData } = useWizardContext();

  // Configuration hooks
  const solutionConfig = useSolutionConfiguration();

  const publisherConfig = usePublisherConfiguration();

  // Form validation hook
  const {
    errors: localValidationErrors,
    validateField,
    validateForm,
  } = useFormValidation({
    validateOnChange: autoValidate,
  });

  // Combine external and local validation errors
  const combinedValidationErrors = {
    ...validationErrors,
    ...localValidationErrors,
  };

  /**
   * Handles solution form data changes
   */
  const handleSolutionFormDataChange = useCallback((updates: Partial<SolutionFormData>) => {
    setSolutionFormData(prev => {
      const newData = { ...prev, ...updates };
      
      // Notify parent of form data changes
      onFormDataChange?.({
        ...publisherFormData,
        ...newData,
      });
      
      // Auto-validate if enabled
      if (autoValidate) {
        Object.keys(updates).forEach(field => {
          validateField(field, (newData as any)[field]);
        });
      }
      
      return newData;
    });
  }, [publisherFormData, onFormDataChange, autoValidate, validateField]);

  /**
   * Handles publisher form data changes
   */
  const handlePublisherFormDataChange = useCallback((updates: Partial<PublisherFormData>) => {
    setPublisherFormData(prev => {
      const newData = { ...prev, ...updates };
      
      // Notify parent of form data changes
      onFormDataChange?.({
        ...solutionFormData,
        ...newData,
      });
      
      // Auto-validate if enabled
      if (autoValidate) {
        Object.keys(updates).forEach(field => {
          validateField(field, (newData as any)[field]);
        });
      }
      
      return newData;
    });
  }, [solutionFormData, onFormDataChange, autoValidate, validateField]);

  /**
   * Validates the entire form and notifies parent
   */
  const handleFullValidation = useCallback(() => {
    const allFormData = { ...solutionFormData, ...publisherFormData };
    const formErrors = validateForm(allFormData);
    
    // Notify parent of validation state
    onValidationChange?.(formErrors);
    
    return Object.keys(formErrors).length === 0;
  }, [solutionFormData, publisherFormData, validateForm, onValidationChange]);

  /**
   * Handles solution creation
   */
  const handleCreateSolution = useCallback(() => {
    if (handleFullValidation()) {
      onCreateSolution?.({
        name: solutionFormData.solutionName,
        internalName: solutionFormData.solutionUniqueName,
        includeRelatedTables: solutionFormData.includeRelatedTables || false,
        solutionName: solutionFormData.solutionName,
        solutionUniqueName: solutionFormData.solutionUniqueName,
      });
    }
  }, [solutionFormData, handleFullValidation, onCreateSolution]);

  /**
   * Handles publisher creation
   */
  const handleCreatePublisher = useCallback(() => {
    if (handleFullValidation()) {
      onCreatePublisher?.(publisherFormData);
    }
  }, [publisherFormData, handleFullValidation, onCreatePublisher]);

  /**
   * Handles refresh of both solutions and publishers
   */
  const handleRefresh = useCallback(() => {
    onRefreshData?.();
  }, [onRefreshData]);

  // Sync external form data changes
  useEffect(() => {
    if (externalFormData) {
      setSolutionFormData(prev => ({
        ...prev,
        name: externalFormData.solutionName || '',
        internalName: externalFormData.solutionInternalName || '',
        solutionName: externalFormData.solutionName || '',
        solutionUniqueName: externalFormData.solutionInternalName || '',
      }));
      
      setPublisherFormData(prev => ({
        ...prev,
        name: externalFormData.newPublisherName || '',
        internalName: externalFormData.newPublisherInternalName || '',
        prefix: externalFormData.newPublisherPrefix || '',
        publisherName: externalFormData.newPublisherName || '',
        publisherUniqueName: externalFormData.newPublisherInternalName || '',
        publisherPrefix: externalFormData.newPublisherPrefix || '',
        publisherDescription: '',
      }));
    }
  }, [externalFormData]);

  // Update validation when form data changes
  useEffect(() => {
    if (autoValidate && showValidation) {
      handleFullValidation();
    }
  }, [solutionFormData, publisherFormData, autoValidate, showValidation, handleFullValidation]);

  // Load environments on component mount
  useEffect(() => {
    const loadEnvironments = async () => {
      setEnvironmentsLoading(true);
      setEnvironmentsError(null);
      
      try {
        const response = await fetch('/api/environments');
        if (!response.ok) {
          throw new Error(`Failed to load environments: ${response.statusText}`);
        }
        
        const envData = await response.json();
        setEnvironments(envData);
        
        // Auto-select first environment if available
        if (envData.length > 0 && !selectedEnvironment) {
          setSelectedEnvironment(envData[0]);
        }
      } catch (error) {
        console.error('Failed to load environments:', error);
        setEnvironmentsError(error instanceof Error ? error.message : 'Failed to load environments');
      } finally {
        setEnvironmentsLoading(false);
      }
    };
    
    loadEnvironments();
  }, []);

  // Update wizard context when environment changes
  useEffect(() => {
    if (selectedEnvironment) {
      console.log('📍 SolutionSetupStep: Updating wizard context with environment:', selectedEnvironment);
      updateWizardData({ targetEnvironment: selectedEnvironment });
    }
  }, [selectedEnvironment, updateWizardData]);

  // Determine overall configuration status
  const isConfigurationComplete = Boolean(
    (currentSolution || (solutionFormData.name && solutionFormData.internalName)) &&
    (currentPublisher || (publisherFormData.name && publisherFormData.internalName && publisherFormData.prefix)) &&
    selectedEnvironment
  );

  const hasValidationErrors = Object.keys(combinedValidationErrors).length > 0;

  return (
    <div className={styles.container}>
      {/* Step Header */}
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <Text size={600} weight="semibold">
            Solution & Publisher Setup
          </Text>
          <Text size={300} className={styles.headerDescription}>
            Configure where your schema will be deployed in Microsoft Dataverse
          </Text>
        </div>
        
        {/* Global Actions */}
        <div className={styles.headerActions}>
          {onRefreshData && (
            <Button
              appearance="subtle"
              onClick={handleRefresh}
              disabled={disabled || loading}
            >
              {loading ? <Spinner size="tiny" /> : 'Refresh Data'}
            </Button>
          )}
        </div>
      </div>

      {/* Environment Selection Section */}
      <div style={{ backgroundColor: 'red', padding: '20px', margin: '20px 0' }}>
        <h2>ENVIRONMENT SECTION TEST</h2>
        <p>If you see this red box, the environment section is rendering!</p>
      </div>

      {/* Global Error Display */}
      {error && (
        <MessageBar intent="error" className={styles.globalError}>
          <MessageBarBody>
            <ErrorCircleRegular className={styles.errorIcon} />
            {error}
          </MessageBarBody>
        </MessageBar>
      )}

      {/* Loading State */}
      {loading && (
        <Card className={styles.loadingCard}>
          <div className={styles.loadingContent}>
            <Spinner size="medium" />
            <Text size={400}>Loading solutions and publishers...</Text>
          </div>
        </Card>
      )}

      {/* Main Content */}
      {!loading && (
        <div className={styles.content}>
          {/* Publisher Configuration Section */}
          <section className={styles.section}>
            <PublisherConfigSection
              publisherConfig={publisherConfig}
              formData={publisherFormData}
              validationErrors={combinedValidationErrors}
              onFormDataChange={handlePublisherFormDataChange}
              onCreateNewPublisher={onCreatePublisher ? handleCreatePublisher : undefined}
              onEditPublisher={onEditPublisher}
              onRefreshPublishers={handleRefresh}
            />
          </section>

          <Divider className={styles.sectionDivider} />

          {/* Solution Configuration Section */}
          <section className={styles.section}>
            <SolutionConfigSection
              solutionConfig={solutionConfig}
              formData={solutionFormData}
              validationErrors={combinedValidationErrors}
              onFormDataChange={handleSolutionFormDataChange}
              onCreateNewSolution={onCreateSolution ? handleCreateSolution : undefined}
              onEditSolution={onEditSolution}
              onRefreshSolutions={handleRefresh}
            />
          </section>
        </div>
      )}

      {/* Configuration Status Summary */}
      {!loading && showValidation && (
        <Card className={styles.statusCard}>
          <div className={styles.statusContent}>
            {isConfigurationComplete && !hasValidationErrors && selectedEnvironment ? (
              <div className={styles.statusSuccess}>
                <CheckmarkCircleRegular className={styles.statusIcon} />
                <div>
                  <Text size={400} weight="semibold">Configuration Complete</Text>
                  <Text size={200} className={styles.statusDetails}>
                    Your schema will be deployed to {currentSolution?.friendlyname || solutionFormData.name} 
                    (Publisher: {currentPublisher?.friendlyname || publisherFormData.name})
                    {selectedEnvironment && (
                      <> in the <strong>{selectedEnvironment.name}</strong> environment</>
                    )}
                  </Text>
                </div>
              </div>
            ) : !selectedEnvironment ? (
              <div className={styles.statusPending}>
                <InfoRegular className={styles.statusIcon} />
                <div>
                  <Text size={400} weight="semibold">Environment Required</Text>
                  <Text size={200} className={styles.statusDetails}>
                    Please select a target environment for deployment
                  </Text>
                </div>
              </div>
            ) : hasValidationErrors ? (
              <div className={styles.statusError}>
                <WarningRegular className={styles.statusIcon} />
                <div>
                  <Text size={400} weight="semibold">Configuration Issues</Text>
                  <Text size={200} className={styles.statusDetails}>
                    Please resolve the validation errors before proceeding
                  </Text>
                </div>
              </div>
            ) : (
              <div className={styles.statusPending}>
                <InfoRegular className={styles.statusIcon} />
                <div>
                  <Text size={400} weight="semibold">Configuration Required</Text>
                  <Text size={200} className={styles.statusDetails}>
                    Please complete both solution and publisher configuration
                  </Text>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};
