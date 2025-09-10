/**
 * GlobalChoicesStep Orchestrator Component
 * Main orchestrator that integrates all extracted components
 */

import React from 'react';
import {
  Card,
  CardHeader,
  Text,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  MessageBar,
  MessageBarBody,
  Button
} from '@fluentui/react-components';
import { SettingsRegular } from '@fluentui/react-icons';
import { useWizardContext } from '../../../../context/WizardContext';
import { 
  useGlobalChoicesData, 
  useChoiceSelection, 
  useFileUpload, 
  useChoicesValidation 
} from './hooks';
import {
  ChoiceSearch,
  GlobalChoicesList,
  CustomChoicesUpload,
  UploadedChoicesPreview,
  GlobalChoicesNavigation
} from './components';
import type { GlobalChoicesStepProps } from './types';
import styles from '../GlobalChoicesStep.module.css';

export const GlobalChoicesStep: React.FC<GlobalChoicesStepProps> = ({
  onNext,
  onPrevious,
}) => {
  const { wizardData, updateWizardData } = useWizardContext();
  const { globalChoicesSearchTerm } = wizardData;

  // Custom hooks
  const { builtInChoices, customChoices, loading, error, refetch } = useGlobalChoicesData();
  const { selectedChoices, handleChoiceSelect } = useChoiceSelection([...builtInChoices, ...customChoices]);
  const { uploadedFile, uploadedChoices, isUploading, uploadError, handleFileUpload } = useFileUpload();
  const { isValid } = useChoicesValidation();

  // Handle search term updates
  const handleSearchChange = (value: string) => {
    updateWizardData({ globalChoicesSearchTerm: value });
  };

  return (
    <Card>
      <CardHeader
        header={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <SettingsRegular />
            <Text className={styles.headerText}>
              Global Choices (Optional)
            </Text>
          </div>
        }
      />

      <div className={styles.cardContent}>
        <Accordion
          multiple
          defaultOpenItems={['global-choice-sets', 'upload-choices']}
          className={styles.accordion}
        >
          {/* Existing Global Choice Sets */}
          <AccordionItem value="global-choice-sets">
            <AccordionHeader expandIconPosition="start">
              <Text className={styles.accordionHeaderText}>
                Global Choice Sets
              </Text>
            </AccordionHeader>
            <AccordionPanel>
              <Text size={300} style={{ color: '#6b6b6b', marginBottom: '24px' }}>
                Select existing global choice sets from your environment.
              </Text>

              {/* Search Component */}
              <ChoiceSearch
                value={globalChoicesSearchTerm || ''}
                onChange={handleSearchChange}
              />

              {/* Error Handling */}
              {error && (
                <MessageBar intent="error" style={{ marginBottom: '16px' }}>
                  <MessageBarBody>
                    {error}
                    <Button 
                      appearance="transparent" 
                      size="small" 
                      onClick={refetch}
                      style={{ marginLeft: '8px' }}
                    >
                      Retry
                    </Button>
                  </MessageBarBody>
                </MessageBar>
              )}

              {/* Built-in Choices List */}
              {builtInChoices.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <Text weight="semibold" style={{ marginBottom: '12px', display: 'block' }}>
                    Built-in Choices ({builtInChoices.length})
                  </Text>
                  <GlobalChoicesList
                    choices={builtInChoices}
                    selectedChoices={selectedChoices}
                    onChoiceSelect={handleChoiceSelect}
                    searchTerm={globalChoicesSearchTerm || ''}
                    loading={loading}
                  />
                </div>
              )}

              {/* Custom Choices List */}
              {customChoices.length > 0 && (
                <div>
                  <Text weight="semibold" style={{ marginBottom: '12px', display: 'block' }}>
                    Custom Choices ({customChoices.length})
                  </Text>
                  <GlobalChoicesList
                    choices={customChoices}
                    selectedChoices={selectedChoices}
                    onChoiceSelect={handleChoiceSelect}
                    searchTerm={globalChoicesSearchTerm || ''}
                    loading={loading}
                  />
                </div>
              )}
            </AccordionPanel>
          </AccordionItem>

          {/* Upload Custom Choices */}
          <AccordionItem value="upload-choices">
            <AccordionHeader expandIconPosition="start">
              <Text className={styles.accordionHeaderText}>
                Upload Custom Choices
              </Text>
            </AccordionHeader>
            <AccordionPanel>
              {/* File Upload Component */}
              <CustomChoicesUpload
                onFileUpload={handleFileUpload}
                uploadedFile={uploadedFile}
                isUploading={isUploading}
                error={uploadError}
              />

              {/* Uploaded Choices Preview */}
              <UploadedChoicesPreview
                choices={uploadedChoices}
                onRemove={() => {/* TODO: Implement remove logic */}}
              />
            </AccordionPanel>
          </AccordionItem>
        </Accordion>

        {/* Navigation Controls */}
        <GlobalChoicesNavigation
          onNext={onNext || (() => {})}
          onPrevious={onPrevious || (() => {})}
          canProceed={isValid}
          isValid={isValid}
        />
      </div>
    </Card>
  );
};
